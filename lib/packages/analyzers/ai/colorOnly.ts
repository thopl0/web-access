/**
 * Tier-3 AI judge (text-only): color-only information cues (WCAG 1.4.1). Some instructional text tells
 * the user to rely on COLOUR ALONE to find or understand something — "click the green button",
 * "required fields are marked in red", "items shown in red are sold out", "the green line is revenue".
 * Anyone who is colour-blind, or who hears the page through a screen reader (colour isn't announced),
 * has no way to act on that instruction. Deterministic tiers can't catch this: the markup is valid,
 * the failure lives in the MEANING of a sentence, which is exactly an AI judgment call.
 *
 * This is one of the FALSE-POSITIVE-PRONE checks — colour words are everywhere in ordinary prose
 * (brands, descriptions, idioms, product options) and almost none of them are an accessibility
 * problem. So both lines of defence are turned up: a HARD deterministic pre-filter (`collectColorRefs`
 * only returns snippets where a colour word plausibly functions as the SOLE identifier of a control or
 * state) and a ruthlessly precision-biased prompt (flag only a clear, defensible cue; default to "ok"
 * under any doubt). No pixels — GLM's coding-plan endpoint is text-only (see `glm.ts`).
 */
import type { Page } from "playwright";
import type { Finding } from "@web-access/shared";
import { ensureEvalHelpers } from "../util";
import { aiConfigured, glmAsk, parseJsonObject } from "./glm";
import { meetsConfidence, parseConfidence } from "./gate";

/** A snippet of on-page text that mentions a colour as a possible instruction/status cue. */
export interface ColorOnlyCandidate {
  selector: string;
  /** The sentence/snippet that mentions a colour as a cue (what the user is told to act on by colour). */
  text: string;
  /** Optional nearby context (a heading, list label, or the enclosing element's role) to disambiguate. */
  elementContext?: string;
}

/** Cap how many snippets we send — each is a (free but latency-costing) model call. */
const MAX_SNIPPETS = 15;
/** Skip snippets too short to carry an instruction, or too long to be a single cue sentence. */
const MIN_TEXT_LEN = 8;
const MAX_TEXT_LEN = 240;

/**
 * Collect short visible-text snippets where a colour word plausibly functions as the SOLE way to
 * identify a control or a state. The pre-filter is deliberately HARD (precision over recall): a colour
 * word alone is not enough — the snippet must also read like an INSTRUCTION or a STATUS cue (an
 * imperative, a "marked/shown/highlighted in <colour>" pattern, a "the <colour> X is …" reference).
 * Ordinary descriptive prose, brands, and product options are dropped here so the model is only asked
 * about snippets genuinely worth judging.
 */
export async function collectColorRefs(page: Page): Promise<ColorOnlyCandidate[]> {
  await ensureEvalHelpers(page); // shim esbuild's __name into the page (see util.ts)
  const raw = await page.evaluate(
    ({ minLen, maxLen, cap }) => {
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

      // Colour words we'll look for. Kept to the common, unambiguous-as-a-colour set; "gold"/"silver"
      // etc. are excluded because they're overwhelmingly material/brand nouns, not status cues.
      const COLORS =
        "red|green|blue|yellow|orange|purple|pink|violet|amber|teal|cyan|magenta|grey|gray";
      const colorRe = new RegExp(`\\b(?:${COLORS})\\b`, "i");
      // Cue patterns: a colour word used as an instruction or a state, not as description/brand.
      //  - imperative pointing at a colour: "click/select/press/choose/tap … <colour>"
      //  - "marked/shown/highlighted/displayed/indicated … in <colour>" (status by colour)
      //  - "the <colour> <thing>" reference ("the green line", "the red items")
      //  - "<colour> means/indicates/= …" (a colour-coded legend)
      const cueRe = new RegExp(
        `(?:\\b(?:click|select|press|choose|tap|see|use|find|pick)\\b[^.?!]{0,40}\\b(?:${COLORS})\\b)` +
          `|(?:\\b(?:marked|shown|highlighted|displayed|indicated|coloured|colored|flagged)\\b[^.?!]{0,20}\\b(?:in|with|as)\\b[^.?!]{0,12}\\b(?:${COLORS})\\b)` +
          `|(?:\\bthe\\s+(?:${COLORS})\\b[^.?!]{0,30}\\b(?:line|bar|button|link|field|row|item|items|area|section|dot|marker|label|tab)\\b)` +
          `|(?:\\b(?:${COLORS})\\b\\s*(?:=|means|indicates|signals|represents)\\b)`,
        "i",
      );

      // Walk visible text-bearing leaf elements (skip script/style/hidden), split into sentences,
      // keep only sentences that contain a colour word AND match a cue pattern.
      const out: { selector: string; text: string; elementContext?: string }[] = [];
      const seen = new Set<string>();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
      const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG"]);
      let node = walker.currentNode as Element | null;
      while (node) {
        const el = node;
        node = walker.nextNode() as Element | null;
        if (SKIP.has(el.tagName)) continue;
        // Only consider elements with their OWN direct text (leaf-ish), to avoid huge container dumps.
        const direct = Array.from(el.childNodes)
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent || "")
          .join(" ");
        const text = clip(direct, 600);
        if (text.length < minLen || !colorRe.test(text)) continue;
        const s = getComputedStyle(el);
        if (s.visibility === "hidden" || s.display === "none") continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;

        for (const sentence of text.split(/(?<=[.?!])\s+|\n+/)) {
          const snip = sentence.trim();
          if (snip.length < minLen || snip.length > maxLen) continue;
          if (!colorRe.test(snip) || !cueRe.test(snip)) continue;
          const key = snip.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          const ctx = clip(
            el.closest("[aria-label]")?.getAttribute("aria-label") ||
              el.closest("figure")?.querySelector("figcaption")?.textContent ||
              "",
            120,
          );
          out.push({
            selector: cssPath(el),
            text: snip,
            ...(ctx ? { elementContext: ctx } : {}),
          });
          if (out.length >= cap) break;
        }
        if (out.length >= cap) break;
      }
      return out;
    },
    { minLen: MIN_TEXT_LEN, maxLen: MAX_TEXT_LEN, cap: MAX_SNIPPETS },
  );

  return raw.slice(0, MAX_SNIPPETS);
}

/** The judge's verdict for one snippet. `ok` also covers "not confident enough to flag" (abstain). */
interface Verdict {
  issue: "ok" | "color-only-reference";
  /** How sure the model is this is a real, defensible problem; drives the abstention gate (see
   *  `gate.ts`): a flag below the floor is dropped rather than shown. Parsed leniently. */
  confidence?: string;
  /** One plain sentence for a non-technical site owner (empty when ok). */
  reason: string;
}

const RULE_ID = "color-only-reference";

const SYSTEM_PROMPT =
  "You are an accessibility expert checking ONE snippet of website text for a colour-only " +
  "instruction (WCAG 1.4.1). Flag it ONLY when the text tells the user to rely on COLOUR ALONE to " +
  "find, identify, or understand a control or a state — and colour is the SOLE cue given, with no " +
  "other way (a label, position, shape, icon, or word) to tell the thing apart. Examples that FAIL: " +
  '"click the green button" (no other label), "required fields are marked in red", "items shown in ' +
  'red are sold out", "the blue line is revenue". \n' +
  "DO NOT FLAG (these are fine — answer ok):\n" +
  '- proper nouns / brands / names: "Red Sox", "Bluetooth", "Greenpeace", "Red Hat", "Blue Apron".\n' +
  '- descriptive prose that does not ask the user to act on colour: "a red sunset", "the green hills".\n' +
  '- colour mentioned ALONGSIDE another cue that disambiguates: "click the green Submit button" (the ' +
  'label "Submit" identifies it), "the red Delete icon".\n' +
  '- product/option names or availability: "available in red and blue", "comes in green".\n' +
  '- idioms / figures of speech: "in the red", "green light", "out of the blue", "red flag".\n' +
  "Read the WHOLE sentence before deciding: if it ALSO gives a text label, symbol, shape, or position " +
  'for the same thing (e.g. shown in red AND labelled "Overdue", or a green ✓ vs a red ✗), colour is ' +
  "not the sole cue — answer ok. But a bare pronoun or filler noun (\"the green one\", \"the red item\") " +
  "is NOT a real label: if colour is still the only thing that tells the control or state apart, flag it. " +
  "When the colour is NOT the only way to identify the actionable thing, or you are in ANY doubt, " +
  'answer ok. Also rate your confidence that the problem is real: "high" = obvious/unambiguous, ' +
  '"medium" = likely but some doubt, "low" = a guess. When you answer ok, use "high". Reply ONLY with ' +
  'JSON: {"issue":"ok|color-only-reference","confidence":"high|medium|low","reason":"..."} where ' +
  "reason is one plain, non-technical sentence (empty when ok).";

/** Build a redacted, single-line HTML snippet for the finding (the offending text, clipped). */
function snippetOf(text: string): string {
  const clipped = text.replace(/\s+/g, " ").trim().slice(0, 120);
  return `<text>${clipped}</text>`;
}

/**
 * Ask GLM whether ONE text snippet is a colour-only cue. Returns a Finding for a clear problem, else
 * null. Exported (not just used by `runColorOnlyJudge`) so the eval harness grades this EXACT path —
 * same prompt, model call, and parsing the production scan uses — rather than a drifting copy. Page-
 * free by contract: it only builds a text context and calls the model, so the harness can drive it
 * directly with corpus inputs.
 */
export async function judgeColorOnly(candidate: ColorOnlyCandidate): Promise<Finding | null> {
  const context = [
    `text: ${JSON.stringify(candidate.text)}`,
    candidate.elementContext ? `nearby context: ${JSON.stringify(candidate.elementContext)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await glmAsk([{ type: "text", text: context }], { system: SYSTEM_PROMPT });
  const verdict = parseJsonObject<Verdict>(raw);
  if (verdict.issue !== RULE_ID) return null; // "ok" or any unrecognised label — nothing to report
  // Abstention gate: a flag the model isn't sure enough about is dropped, not shown (see gate.ts).
  if (!meetsConfidence(parseConfidence(verdict.confidence))) return null;

  return {
    ruleId: RULE_ID,
    source: "ai",
    tier: 3,
    wcag: ["1.4.1"],
    impact: "serious",
    selector: candidate.selector,
    htmlSnippet: snippetOf(candidate.text),
    message:
      verdict.reason ||
      "This text uses colour as the only way to identify something, which colour-blind and screen-reader users can't follow.",
  };
}

/**
 * Tier-3 entry point: run the colour-only-cue judge over a rendered page. No-ops (returns `[]`) when
 * no GLM key is configured, so the deterministic tiers work standalone. Each snippet is judged
 * independently with `Promise.allSettled` isolation; a single failed/timed-out judgment never drops
 * the rest.
 */
export async function runColorOnlyJudge(page: Page): Promise<Finding[]> {
  if (!aiConfigured()) return [];
  const candidates = await collectColorRefs(page);
  if (candidates.length === 0) return [];

  const results = await Promise.allSettled(candidates.map((c) => judgeColorOnly(c)));
  const findings: Finding[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) findings.push(r.value);
    else if (r.status === "rejected") console.error("ai color-only judge failed:", r.reason);
  }
  return findings;
}
