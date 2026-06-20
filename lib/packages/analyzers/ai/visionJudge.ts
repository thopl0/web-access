/**
 * Tier-3 AI judge (VISION): the genuine AI residue the deterministic tiers and the text-only judge
 * can't reach (plan §2/§4). Two checks, both needing the actual PIXELS:
 *
 *   1. **alt-text fidelity** — an image HAS non-empty alt, but does it actually + adequately describe
 *      what the image shows? (text-only `altText.ts` can only catch junk/filename/vague alt, never
 *      whether real-looking alt is *accurate*.)
 *   2. **decorative misclassification** — an image was declared decorative (`alt=""`,
 *      `role="presentation"`, `aria-hidden`) but actually carries meaning a screen-reader user needs.
 *
 * Runs against Gemma 4 on Cloudflare Workers AI via the AI Gateway (`gemma.ts`). No-ops (returns `[]`)
 * unless Gemma is configured, so the deterministic tiers + the GLM text judge work standalone. Every
 * per-image call is independent (`Promise.allSettled`): a screenshot we can't grab, a model timeout,
 * or a malformed verdict drops THAT image only — never the scan, never the other findings.
 *
 * Cost/robustness: capped at `MAX_VISION_IMAGES` per page, tiny/huge elements skipped, screenshots
 * sent as quality-bounded JPEG. Precision-biased prompt (flag only with clear evidence; default to
 * "ok" under any doubt) to keep false positives down per the plan's precision-over-recall target.
 */
import type { Page } from "playwright";
import type { Finding } from "@web-access/shared";
import { collectImages, type ImageCandidate } from "./altText";
import { gemmaAsk, gemmaConfigured, parseJsonObject } from "./gemma";
import { meetsConfidence, parseConfidence } from "./gate";

/** Per-page cap — each image is a model call (cost/latency). Fewer than the text judge's 12: vision
 *  calls are pricier and we also pay to screenshot each element. */
const MAX_VISION_IMAGES = 8;
/** Skip elements too small to judge visually or too large to be a useful, cheap crop. */
const MIN_DIMENSION = 32;
const MAX_AREA_PX = 1_500_000; // ~1500×1000; mirrors the worker's evidence-crop ceiling
/** JPEG quality for the crop sent to the model — legible for content while keeping the payload small. */
const SHOT_QUALITY = 70;

/** The judge's verdict for one image. `ok` also covers "not enough certainty to flag" (abstain). */
interface Verdict {
  issue: "ok" | "alt-inaccurate" | "decorative-misclassified";
  /** How sure the model is the problem is real; drives the abstention gate (see `gate.ts`). */
  confidence?: string;
  /** One plain sentence for a non-technical site owner (empty when ok). */
  reason: string;
  /**
   * A concise, accurate, PIXEL-GROUNDED alt text the model wrote for this image while it had the
   * actual pixels in front of it — used only when a problem is flagged. Because the vision judge
   * already paid to look at the image, this costs nothing extra and is far better than the text-only
   * GLM fixer's filename/context guess. Optional/best-effort: a missing or garbled value just omits
   * the ready-made fix; it never breaks the finding.
   */
  suggestedAlt?: string;
}

const ISSUE_META: Record<
  Exclude<Verdict["issue"], "ok">,
  { ruleId: string; impact: Finding["impact"] }
> = {
  "alt-inaccurate": { ruleId: "alt-text-inaccurate", impact: "serious" },
  "decorative-misclassified": { ruleId: "decorative-misclassified", impact: "serious" },
};

const SYSTEM_PROMPT =
  "You are an accessibility expert judging an image against its alt-text declaration for a blind " +
  "screen-reader user. You CAN see the image. You are given the image plus its current alt text and " +
  "whether the author declared it decorative. Decide ONE of:\n" +
  "- alt-inaccurate: the image has alt text, but the alt does NOT accurately or adequately describe " +
  "what the image actually shows or its purpose (wrong subject, misses the key content, or far too " +
  "vague for what's visibly important).\n" +
  "- decorative-misclassified: the author marked the image decorative (empty alt / presentation / " +
  "aria-hidden), but it actually conveys meaningful information or function a user would need.\n" +
  "- ok: the alt fits the image, OR the image is genuinely decorative, OR you are not confident.\n" +
  "Be PRECISION-biased: only flag a CLEAR, defensible problem. When in any doubt, answer ok. Judge " +
  "only what is visible — never invent details. Also rate your confidence that the problem is real: " +
  '"high" = obvious/unambiguous, "medium" = likely but some doubt, "low" = a guess (use "high" when ' +
  'you answer ok). When you flag a problem (alt-inaccurate or decorative-misclassified), ALSO write ' +
  '"suggestedAlt": a concise, accurate alt text describing this image for a screen-reader user. ' +
  'Describe ONLY what is visibly there — be precision-biased: no guesses, no invented detail, no ' +
  'lead-in like "image of". Keep it short (one phrase or sentence). Leave suggestedAlt as "" when ' +
  'you answer ok or have nothing reliable to say. Reply ONLY with JSON: {"issue":"...","confidence":' +
  '"high|medium|low","reason":"...","suggestedAlt":"..."} where reason is one plain, non-technical ' +
  'sentence (empty if ok).';

/** Capture a quality-bounded JPEG of one element, or null if it can't be screenshotted cheaply. */
async function shotOf(page: Page, c: ImageCandidate): Promise<string | null> {
  try {
    const loc = page.locator(c.selector).first();
    const box = await loc.boundingBox({ timeout: 2000 });
    if (!box || box.width < MIN_DIMENSION || box.height < MIN_DIMENSION) return null;
    if (box.width * box.height > MAX_AREA_PX) return null;
    const buf = await loc.screenshot({ type: "jpeg", quality: SHOT_QUALITY, timeout: 2500 });
    return buf.toString("base64");
  } catch {
    return null; // detached / offscreen / un-screenshotable — skip, evidence is optional
  }
}

/** Judge one image's pixels against its alt declaration. Returns a Finding for a real problem, else null. */
async function judgeImage(page: Page, img: ImageCandidate, signal?: AbortSignal): Promise<Finding | null> {
  // aria-hidden images are removed from the accessibility tree — nothing is announced, so there is no
  // alt-fidelity or decorative problem to report for them.
  if (img.ariaHidden) return null;
  // Only two cases are worth a (paid) vision call: a declared-decorative image (could be meaningful),
  // or an image with real alt text (could be inaccurate). An undeclared image with no alt is axe's
  // job (missing alt entirely), not ours.
  const hasAlt = img.alt.trim().length > 0;
  if (!img.declaredDecorative && !hasAlt) return null;

  const base64 = await shotOf(page, img);
  if (!base64) return null;

  const context = [
    `alt: ${hasAlt ? JSON.stringify(img.alt) : "(empty)"}`,
    `author declared decorative: ${img.declaredDecorative ? "yes" : "no"}`,
    img.inLink ? `the image is the content of a link (link text: ${img.linkText || "none"})` : null,
    img.caption ? `figure caption: ${JSON.stringify(img.caption)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await gemmaAsk(
    [
      { type: "image", base64, mediaType: "image/jpeg" },
      { type: "text", text: context },
    ],
    { system: SYSTEM_PROMPT, signal },
  );
  const verdict = parseJsonObject<Verdict>(raw);
  if (verdict.issue === "ok") return null;
  const meta = ISSUE_META[verdict.issue];
  if (!meta) return null; // unrecognised label — ignore defensively
  // Abstention gate: drop a flag the model isn't confident enough about (see gate.ts).
  if (!meetsConfidence(parseConfidence(verdict.confidence))) return null;

  // The redacted element snippet shown in the report (src truncated to just the filename).
  const htmlSnippet = imgSnippet(img.alt, img.filename);

  const finding: Finding = {
    ruleId: meta.ruleId,
    source: "ai",
    tier: 3,
    wcag: ["1.1.1"],
    impact: meta.impact,
    selector: img.selector,
    htmlSnippet,
    message: verdict.reason || "The image's text description does not match what the image shows.",
  };

  // Free ride-along fix: we already saw the pixels, so the alt the model wrote here is pixel-grounded
  // — strictly better than the text-only GLM fixer's filename/context guess. Attach it as the
  // transient `aiFix` (stripped before the finding row is inserted; the worker turns it into the
  // fix_suggestions row directly). Best-effort: a missing/garbled suggestedAlt just omits aiFix and
  // the finding still stands.
  const suggestedAlt = typeof verdict.suggestedAlt === "string" ? verdict.suggestedAlt.trim() : "";
  if (suggestedAlt) {
    finding.aiFix = {
      after: imgSnippet(suggestedAlt, img.filename),
      note: "AI-generated from the image — verify it's accurate before publishing.",
    };
  }

  return finding;
}

/** The redacted `<img>` snippet used in findings/fixes: a given alt plus the filename-truncated src.
 *  Shared so the finding's `htmlSnippet` and the ride-along `aiFix.after` differ ONLY in the alt. */
function imgSnippet(alt: string, filename: string): string {
  return `<img alt=${JSON.stringify(alt)} src="…${filename}">`;
}

/**
 * Tier-3 vision entry point. No-ops (`[]`) when Gemma is unconfigured. Each image is judged
 * independently; a single failure never drops the rest or the scan.
 */
export async function runVisionJudge(page: Page, signal?: AbortSignal): Promise<Finding[]> {
  if (!gemmaConfigured()) return [];
  const images = (await collectImages(page)).slice(0, MAX_VISION_IMAGES);
  if (images.length === 0) return [];

  const results = await Promise.allSettled(images.map((img) => judgeImage(page, img, signal)));
  const findings: Finding[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) findings.push(r.value);
    else if (r.status === "rejected") console.error("ai vision judge failed:", r.reason);
  }
  return findings;
}
