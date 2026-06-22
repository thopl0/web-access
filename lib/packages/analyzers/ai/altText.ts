/**
 * Tier-3 AI judge (text-only): image alt-text *quality*. The deterministic `image-alt` check (axe,
 * Tier 1) only answers "is there alt text at all?". It can't judge whether the alt text is actually
 * useful — placeholder strings ("image", "photo"), the raw filename ("DSC_0421.JPG"), or vague text
 * that doesn't convey the image's purpose all pass axe but fail real screen-reader users.
 *
 * This judge reasons over TEXT the model can actually see: the alt string, the image filename, and
 * surrounding DOM context (caption, link text, aria-label). No pixels — GLM's coding-plan endpoint
 * doesn't deliver images (see `glm.ts`). When a vision-capable provider is wired up later, a
 * separate pixel-based judge (alt *fidelity*, decorative misclassification) can sit alongside this.
 */
import type { Page } from "playwright";
import type { Finding } from "@web-access/shared";
import { ensureEvalHelpers } from "../util";
import { aiConfigured, glmAsk, parseJsonObject } from "./glm";
import { meetsConfidence, parseConfidence } from "./gate";

/** An on-page image and the text context we can give the model, collected in-page. */
export interface ImageCandidate {
  selector: string;
  src: string;
  /** Filename from `src` (basename, query stripped) — often the only content hint we have. */
  filename: string;
  /** Current alt text (`""` = present-but-empty, i.e. declared decorative). */
  alt: string;
  /** Author declared this image decorative (`alt=""`, `role="presentation"`/`"none"`, `aria-hidden`). */
  declaredDecorative: boolean;
  /** `aria-hidden="true"` — removed from the accessibility tree, so its alt is never announced. */
  ariaHidden: boolean;
  /** The image is the (only) content of a link — alt then has to convey the link's destination. */
  inLink: boolean;
  /** Visible text of the enclosing link, if any (helps judge whether alt is redundant/missing). */
  linkText: string;
  /** `<figcaption>` text, if the image sits in a `<figure>`. */
  caption: string;
  /** `aria-label` / `title`, if present. */
  ariaLabel: string;
  width: number;
  height: number;
}

/** Skip tiny images (icons/spacers) and cap how many we send — each is a model call (plan: cost). */
const MIN_DIMENSION = 32;
const MAX_IMAGES = 12;

/** Basename of a URL/path, query and hash stripped. */
function filenameOf(src: string): string {
  try {
    const path = src.split(/[?#]/)[0] ?? "";
    return decodeURIComponent(path.split("/").pop() ?? "");
  } catch {
    return "";
  }
}

/** Collect visible <img> candidates with their alt/role state and surrounding text context. */
export async function collectImages(page: Page): Promise<ImageCandidate[]> {
  await ensureEvalHelpers(page); // shim esbuild's __name into the page (see util.ts)
  const raw = await page.evaluate(
    ({ minDim }) => {
      function cssPath(node: Element): string {
        if (node.id) return `#${CSS.escape(node.id)}`;
        const parts: string[] = [];
        let el: Element | null = node;
        while (el && el.nodeType === 1 && el.tagName !== "HTML") {
          let part = el.tagName.toLowerCase();
          const parent: Element | null = el.parentElement;
          if (parent) {
            const sameTag = Array.from(parent.children).filter((c) => c.tagName === el!.tagName);
            if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(el) + 1})`;
          }
          parts.unshift(part);
          el = parent;
        }
        return parts.join(" > ");
      }

      const clip = (s: string | null | undefined, n: number) =>
        (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

      const out = [];
      for (const img of Array.from(document.querySelectorAll("img"))) {
        const r = img.getBoundingClientRect();
        if (r.width < minDim || r.height < minDim) continue;
        const s = getComputedStyle(img);
        if (s.visibility === "hidden" || s.display === "none") continue;
        const role = img.getAttribute("role");
        const altAttr = img.getAttribute("alt");
        const link = img.closest("a");
        const figure = img.closest("figure");
        out.push({
          selector: cssPath(img),
          src: img.currentSrc || img.src,
          alt: altAttr ?? "",
          declaredDecorative:
            altAttr === "" ||
            role === "presentation" ||
            role === "none" ||
            img.getAttribute("aria-hidden") === "true",
          ariaHidden: img.getAttribute("aria-hidden") === "true",
          inLink: link !== null,
          linkText: clip(link?.textContent, 120),
          caption: clip(figure?.querySelector("figcaption")?.textContent, 200),
          ariaLabel: clip(img.getAttribute("aria-label") || img.getAttribute("title"), 120),
          width: Math.round(r.width),
          height: Math.round(r.height),
        });
      }
      return out;
    },
    { minDim: MIN_DIMENSION },
  );

  return raw.slice(0, MAX_IMAGES).map((c) => ({ ...c, filename: filenameOf(c.src) }));
}

/** The judge's verdict for one image. */
interface Verdict {
  issue: "ok" | "uninformative-alt" | "filename-as-alt" | "redundant-phrasing";
  /** How sure the model is this is a real, defensible problem. Drives the abstention gate (see
   *  `gate.ts`): a flag below the floor is dropped rather than shown. Parsed leniently. */
  confidence?: string;
  /** One-sentence, layperson explanation of what's wrong (empty when ok). */
  reason: string;
}

const SYSTEM_PROMPT =
  "You are an accessibility expert judging the QUALITY of an image's alt text for a blind " +
  "screen-reader user, using ONLY the text given (you cannot see the image). Judge:\n" +
  "- filename-as-alt: the alt text is a camera/system filename or opaque code that conveys nothing " +
  '(e.g. "DSC_0421.JPG", "IMG_2024", "a1b2c3.png", "screenshot-2023-11-02"). Do NOT flag alt that ' +
  "merely resembles a slug but reads as a real description (e.g. \"model-s\", \"iphone-15-pro\", a " +
  "brand or product name) — that is fine.\n" +
  "- uninformative-alt: the alt is a vague placeholder (\"image\", \"photo\", \"graphic\", " +
  '"untitled") that does not describe what the image shows or does.\n' +
  '- redundant-phrasing: the alt OPENS with a redundant image-announcing lead-in — "image of" / ' +
  '"photo of" / "picture of" / "graphic of" / "screenshot of" / "logo of" / "icon of" (screen ' +
  "readers already announce it as an image). ONLY the leading announcement is redundant. Do NOT flag " +
  'a TRAILING descriptor that distinguishes this image from others (e.g. "… font preview", ' +
  '"… diagram", "… logo", "… thumbnail", "… chart") — those carry real, distinguishing meaning and ' +
  "must stay.\n" +
  "- ok: the alt text is a plausibly useful description, OR you lack enough text to judge.\n" +
  "Be conservative — only flag clear problems. Do NOT guess about visual accuracy (you can't see " +
  "the image). Also rate your confidence that the problem is real and a screen-reader user would " +
  'agree: "high" = obvious/unambiguous, "medium" = likely but some doubt, "low" = a guess. When you ' +
  'answer ok, use "high". Reply ONLY with JSON: {"issue":"...","confidence":"high|medium|low",' +
  '"reason":"..."} — reason is one plain sentence (empty when ok).';

/**
 * A genuinely redundant image-announcing LEAD-IN at the very start of the alt — the only thing the
 * `redundant-phrasing` rule should ever fire on. Matches "image of", "a photo of", "picture:",
 * "screenshot showing", "logo of", etc. Does NOT match a trailing descriptor like "ITC Avant Garde
 * font preview", so meaningful distinguishing words are never stripped.
 */
const REDUNDANT_LEAD_IN =
  /^\s*(an?\s+)?(image|images|photo|photos|photograph|picture|pictures|pic|graphic|graphics|icon|logo|screenshot|drawing|illustration|figure|banner)\b\s*(of|showing|depicting|that shows|with|:)/i;

const ISSUE_META: Record<
  Exclude<Verdict["issue"], "ok">,
  { ruleId: string; impact: Finding["impact"] }
> = {
  "filename-as-alt": { ruleId: "alt-text-filename", impact: "moderate" },
  "uninformative-alt": { ruleId: "alt-text-uninformative", impact: "serious" },
  "redundant-phrasing": { ruleId: "alt-text-redundant", impact: "minor" },
};

/**
 * Ask GLM to judge one image's alt-text quality. Returns a Finding for a real problem, else null.
 * Exported (not just used by `runAltTextJudge`) so the eval harness grades this EXACT path — same
 * prompt, model call, and parsing the production scan uses — rather than a drifting copy.
 */
export async function judgeAltText(img: ImageCandidate): Promise<Finding | null> {
  // aria-hidden images are removed from the accessibility tree — their alt is never announced, so
  // there is no alt-text quality problem to report (any link-name issue is axe's job, not ours).
  if (img.ariaHidden) return null;
  // Nothing to judge: a genuinely decorative image with no alt and no link/caption context.
  if (img.declaredDecorative && !img.inLink && !img.caption) return null;

  const context = [
    `filename: ${img.filename || "(unknown)"}`,
    `alt: ${img.alt ? JSON.stringify(img.alt) : "(empty)"}`,
    img.inLink ? `inside a link; link text: ${img.linkText || "(none)"}` : null,
    img.caption ? `figure caption: ${JSON.stringify(img.caption)}` : null,
    img.ariaLabel ? `aria-label/title: ${JSON.stringify(img.ariaLabel)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await glmAsk([{ type: "text", text: context }], { system: SYSTEM_PROMPT });
  const verdict = parseJsonObject<Verdict>(raw);
  if (verdict.issue === "ok") return null;
  const meta = ISSUE_META[verdict.issue];
  if (!meta) return null; // unrecognised label from the model — ignore defensively
  // Deterministic guard: "redundant-phrasing" is, by definition, a redundant image-announcing LEAD-IN.
  // The model sometimes over-applies it to a meaningful trailing descriptor (e.g. "… font preview",
  // which distinguishes a preview from a charmap). Only honour the flag when the alt actually OPENS
  // with such a phrase — otherwise drop it, so we never strip distinguishing words.
  if (verdict.issue === "redundant-phrasing" && !REDUNDANT_LEAD_IN.test(img.alt ?? "")) return null;
  // Abstention gate: a flag the model isn't sure enough about is dropped, not shown (see gate.ts).
  if (!meetsConfidence(parseConfidence(verdict.confidence))) return null;

  return {
    ruleId: meta.ruleId,
    source: "ai",
    tier: 3,
    wcag: ["1.1.1"],
    impact: meta.impact,
    selector: img.selector,
    htmlSnippet: `<img alt=${JSON.stringify(img.alt)} src="…${img.filename}">`,
    message: verdict.reason || "The alt text does not adequately describe this image.",
  };
}

/**
 * Tier-3 entry point: run the AI alt-text quality judge over a rendered page. No-ops (returns `[]`)
 * when no GLM key is configured, so the deterministic tiers work standalone. Each image is judged
 * independently; a single failed judgment doesn't drop the rest.
 */
export async function runAltTextJudge(page: Page): Promise<Finding[]> {
  if (!aiConfigured()) return [];
  const images = await collectImages(page);
  if (images.length === 0) return [];

  const results = await Promise.allSettled(images.map((img) => judgeAltText(img)));
  const findings: Finding[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) findings.push(r.value);
    else if (r.status === "rejected") console.error("ai alt-text judge failed:", r.reason);
  }
  return findings;
}
