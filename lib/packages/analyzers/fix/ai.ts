/**
 * AI fix generator (Tier-3, text-only): for JUDGMENT findings where the *correct* markup can't be
 * mechanically templated — the alt-text CONTENT rules and ambiguous link names — ask GLM to write a
 * corrected `before→after` from the only signals it has in text: the filename derived from the
 * snippet's `src`, the current alt, the link text in the snippet, and the finding's message. The
 * coding-plan endpoint can't see pixels (see `glm.ts`), so any alt the model writes is derived from
 * filename/surrounding text and is necessarily conservative — every AI fix is `needsReview: true`
 * and never auto-applied.
 *
 * One batched GLM call per scan (mirrors `ai/enrich.ts`): findings are deduped by (rule + element
 * HTML) so identical spots cost one slot, capped at MAX_ITEMS, and each item carries an explicit
 * `id` so the reply can't drift out of alignment. Never throws — any failure returns all-nulls
 * aligned to the input, so the deterministic layer (and the rest of the report) is unaffected.
 */
import type { Finding, FixSuggestion } from "@web-access/shared";
import { aiConfigured, glmAsk, parseJsonObject } from "../ai/glm";

/** Cap items per scan to bound tokens/latency; findings beyond this get no AI fix (stay null). */
const MAX_ITEMS = 25;

/**
 * Rules whose fix is a genuine judgment call about *content* (not a mechanical transform). These are
 * the only findings this generator touches; everything else returns null so `deterministicFix`
 * handles it. The alt-text set covers axe's `image-alt` (no alt at all) plus the Tier-3 alt-quality
 * verdicts from `ai/altText.ts`; `link-name` is the ambiguous/empty accessible-link-name case; the
 * rest are the Tier-3 GLM judgment checks whose fix is element-level reworded CONTENT (the link text,
 * heading, page title, error message, or colour-reliant phrasing the judge flagged). Set-based or
 * non-element findings (e.g. `ambiguous-repeated-links`) are deliberately absent — there's no single
 * before→after element to rewrite, so they're served by the explanation + AI-builder prompt instead.
 */
const JUDGMENT_RULES = new Set([
  "image-alt",
  "alt-text-filename",
  "alt-text-uninformative",
  "alt-text-redundant",
  "link-name",
  "link-purpose-unclear",
  "heading-uninformative",
  "page-title-uninformative",
  "form-error-unclear",
  "color-only-reference",
]);

/** Default note when the model doesn't supply one — every AI fix is filename/context-derived. */
const DEFAULT_NOTE = "AI-suggested from filename/context — verify it matches the image.";

const SYSTEM_PROMPT =
  "You improve web-accessibility MARKUP for non-technical site owners (people building sites with AI " +
  "tools like Lovable, v0, Wix). You're given a list of issues; each has an id, a rule id, the " +
  "generic issue message, and the HTML of the offending element. For EACH issue, return the " +
  "CORRECTED markup that fixes only the accessibility problem.\n" +
  "CRITICAL CONSTRAINTS:\n" +
  "- You CANNOT see images (text only). Derive any alt text from the filename, surrounding/link " +
  "text, and the message. Be conservative and clearly descriptive; never claim visual detail you " +
  "can't verify. If you truly have nothing to go on, write a brief, plausible placeholder.\n" +
  "- Keep the ORIGINAL element's tag and all its other attributes/content. Only change what's needed " +
  "to fix the issue (e.g. fill in a meaningful `alt`, or give a link readable text). Do not rewrite " +
  "or restructure unrelated markup.\n" +
  "- For an empty/placeholder/filename alt, replace it with a short meaningful description. For an " +
  'alt that opens with "image of"/"photo of", drop that redundant lead-in. For an ambiguous link, ' +
  "make its accessible name describe the destination.\n" +
  "- link-purpose-unclear: rewrite the link's visible text so it names where it goes (e.g. \"Read " +
  'more" → "Read more about our pricing"); if the visible wording must stay, add an aria-label that ' +
  "spells out the destination instead.\n" +
  "- heading-uninformative: rewrite the heading's text so it briefly describes the section it labels " +
  "(keep the same heading level/tag).\n" +
  "- page-title-uninformative: rewrite the <title> so it names what the page is about, ideally with " +
  'the brand (e.g. "Pricing — Acme"); keep the <title> tag.\n' +
  "- form-error-unclear: rewrite the error message so it says what's expected or how to fix it (name " +
  'the format or give an example, e.g. "Enter a valid email like name@example.com").\n' +
  "- color-only-reference: reword the text so it doesn't rely on colour alone — name the control, add " +
  'a label/icon/position cue (e.g. "click the green button" → "click the green Submit button").\n' +
  "Use the issue message (the judge's specific reason) to ground each rewrite. You cannot see images " +
  "or the rendered page, so keep rewrites conservative and never claim visual detail you can't verify.\n" +
  'Return ONLY JSON of the form {"items":[{"id":0,"after":"<corrected markup>","note":"..."}]} — ' +
  "exactly one entry per input id. `note` is one short sentence on what the owner should verify.";

interface FixItem {
  id: number;
  rule: string;
  message: string;
  html: string;
}

/**
 * Suggest a corrected `after` markup for each judgment finding, aligned to the input array (`null`
 * where no AI fix applies: AI unconfigured, a non-judgment rule, over the cap, or a model miss).
 * Never throws — on any failure it returns all-nulls so the caller falls back to the generic state.
 */
export async function aiFixes(findings: Finding[]): Promise<(FixSuggestion | null)[]> {
  const out: (FixSuggestion | null)[] = findings.map(() => null);
  if (!aiConfigured() || findings.length === 0) return out;

  // Dedupe by (rule + element HTML); only judgment-rule findings get an AI fix (the rest are the
  // deterministic layer's job, so they stay null here).
  const keyToIndices = new Map<string, number[]>();
  const items: FixItem[] = [];
  const keyToItemId = new Map<string, number>();

  findings.forEach((f, i) => {
    if (!JUDGMENT_RULES.has(f.ruleId)) return;
    const key = `${f.ruleId}\n${f.htmlSnippet}`;
    const seen = keyToIndices.get(key);
    if (seen) {
      seen.push(i);
      return;
    }
    keyToIndices.set(key, [i]);
    if (items.length < MAX_ITEMS) {
      keyToItemId.set(key, items.length);
      items.push({ id: items.length, rule: f.ruleId, message: f.message, html: f.htmlSnippet });
    }
  });

  if (items.length === 0) return out;

  let parsed: { items?: Array<{ id: number; after?: string; note?: string }> };
  try {
    const raw = await glmAsk([{ type: "text", text: JSON.stringify({ issues: items }) }], {
      system: SYSTEM_PROMPT,
      maxTokens: 3000,
    });
    parsed = parseJsonObject(raw);
  } catch (e) {
    console.error("ai fix failed:", e);
    return out;
  }

  // Index the model's replies by id; skip anything missing an id or `after` (defensive, like enrich).
  const byItemId = new Map<number, { after: string; note?: string }>();
  for (const r of parsed.items ?? []) {
    if (typeof r?.id !== "number" || !r.after) continue;
    byItemId.set(r.id, { after: r.after, ...(r.note ? { note: r.note } : {}) });
  }

  for (const [key, indices] of keyToIndices) {
    const itemId = keyToItemId.get(key);
    if (itemId === undefined) continue; // beyond the cap
    const reply = byItemId.get(itemId);
    if (!reply) continue;
    for (const i of indices) {
      const f = findings[i]!;
      out[i] = {
        ruleId: f.ruleId,
        kind: "ai",
        before: f.htmlSnippet,
        after: reply.after,
        needsReview: true, // AI fixes are filename/context-derived — always confirm by a human.
        note: reply.note || DEFAULT_NOTE,
      };
    }
  }
  return out;
}

/** Single-finding convenience over the batch (`aiFixes`). Prefer the batch in worker/report paths. */
export async function aiFix(finding: Finding): Promise<FixSuggestion | null> {
  return (await aiFixes([finding]))[0] ?? null;
}
