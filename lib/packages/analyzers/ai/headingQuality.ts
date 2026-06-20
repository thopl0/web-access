/**
 * Tier-3 AI judge (text-only): heading *descriptiveness*. axe's `heading-order` (Tier 1) already
 * answers "do heading LEVELS nest correctly?" and `empty-heading` answers "is the heading blank?".
 * Neither can judge whether the heading TEXT actually labels the section it heads — a vague or
 * placeholder heading ("More", "Info", "Section 1", "Untitled", "Welcome", "Click here") nests fine
 * and is non-empty, yet tells nothing to a screen-reader user skimming the page by heading (a primary
 * navigation strategy). That's a WCAG 2.4.6 (Headings and Labels) / 1.3.1 (Info and Relationships)
 * gap this judge fills.
 *
 * Like the alt-text judge this reasons over TEXT only (the heading string + a clip of the section it
 * introduces) — no pixels needed, and GLM's coding-plan endpoint is text-only anyway (see `glm.ts`).
 * We do NOT re-check heading levels here; that stays deterministic.
 */
import type { Page } from "playwright";
import type { Finding } from "@web-access/shared";
import { ensureEvalHelpers } from "../util";
import { aiConfigured, glmAsk, parseJsonObject } from "./glm";
import { meetsConfidence, parseConfidence } from "./gate";

/** A heading and the text context we can give the model to judge whether it labels its section. */
export interface HeadingQualityCandidate {
  selector: string;
  /** Heading level 1–6 (from the tag name, or `aria-level` on a `role="heading"`). */
  level: number;
  /** The heading's visible text (collapsed, trimmed). */
  text: string;
  /** A clipped snippet of the content that FOLLOWS this heading, up to the next heading — what the
   *  heading is supposed to describe. The judge compares the heading against this. */
  sectionPreview: string;
  /** Optional: a little of the text that PRECEDES the heading (helps disambiguate terse headings). */
  precedingText?: string;
}

/** Cap how many headings we send — each is a (free but latency-costing) model call. */
const MAX_HEADINGS = 20;
/** Longest heading we still bother judging: anything beyond this is almost certainly descriptive. */
const LONG_HEADING_CHARS = 60;
/** Word count past which a heading is treated as "obviously descriptive" and skipped (cheap filter). */
const DESCRIPTIVE_WORD_COUNT = 4;

/**
 * Deterministic pre-filter: is this heading worth a model call? We send only headings whose
 * descriptiveness is genuinely in question — short ones, single/low-word-count ones, or ones that
 * match a placeholder pattern — and skip the obviously-descriptive multi-word headings to save calls.
 * Kept in module scope (not the page) so the eval harness exercises the SAME gate the scan uses.
 */
export function isWorthJudging(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (t === "") return false; // empty headings are axe's `empty-heading`, not ours
  const words = t.split(" ").filter(Boolean);
  // Placeholder/boilerplate strings worth flagging even when not strictly "short".
  const PLACEHOLDER =
    /^(more|info|information|section\s*\d*|untitled|heading\s*\d*|title|welcome|overview|details|click here|read more|learn more|lorem ipsum|test|todo|tbd|n\/?a|new section|content)$/i;
  if (PLACEHOLDER.test(t)) return true;
  // Long, multi-word headings are almost always descriptive — don't spend a call on them.
  if (words.length > DESCRIPTIVE_WORD_COUNT && t.length > LONG_HEADING_CHARS) return false;
  // Otherwise it's short/terse enough that descriptiveness is genuinely in question — judge it.
  return words.length <= DESCRIPTIVE_WORD_COUNT || t.length <= LONG_HEADING_CHARS;
}

/** Collect in-DOM-order headings (h1–h6 and ARIA headings) with a preview of the section each labels. */
export async function collectHeadings(page: Page): Promise<HeadingQualityCandidate[]> {
  await ensureEvalHelpers(page); // shim esbuild's __name into the page (see util.ts)
  const raw = await page.evaluate(() => {
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

    /** Level for a heading element, or null if it isn't one. */
    function levelOf(el: Element): number | null {
      const tag = el.tagName.toLowerCase();
      const m = /^h([1-6])$/.exec(tag);
      if (m) return Number(m[1]);
      if (el.getAttribute("role") === "heading") {
        const lvl = Number(el.getAttribute("aria-level"));
        return Number.isInteger(lvl) && lvl >= 1 && lvl <= 6 ? lvl : 2;
      }
      return null;
    }

    const headings = Array.from(
      document.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6,[role='heading']"),
    ).filter((el) => {
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || s.display === "none") return false;
      return clip(el.textContent, 200) !== ""; // skip empty (axe's empty-heading covers it)
    });

    const out = [];
    for (let i = 0; i < headings.length; i++) {
      const el = headings[i]!;
      const level = levelOf(el);
      if (level === null) continue;

      // Section preview: text after this heading, stopping at the next heading in document order.
      const next = headings[i + 1] ?? null;
      const range = document.createRange();
      range.setStartAfter(el);
      if (next) range.setEndBefore(next);
      else range.setEndAfter(document.body);
      const sectionPreview = clip(range.toString(), 400);

      // A little preceding context (previous sibling-ish text) to disambiguate terse headings.
      const precedingText = clip(el.previousElementSibling?.textContent, 160);

      out.push({
        selector: cssPath(el),
        level,
        text: clip(el.textContent, 200),
        sectionPreview,
        precedingText,
      });
    }
    return out;
  });

  // Deterministic pre-filter + cap, in module scope so the eval harness shares this exact gate.
  return raw
    .filter((h) => isWorthJudging(h.text))
    .slice(0, MAX_HEADINGS)
    .map((h) => {
      const c: HeadingQualityCandidate = {
        selector: h.selector,
        level: h.level,
        text: h.text,
        sectionPreview: h.sectionPreview,
      };
      if (h.precedingText) c.precedingText = h.precedingText;
      return c;
    });
}

/** The judge's verdict for one heading. */
interface Verdict {
  issue: "ok" | "uninformative-heading";
  /** How sure the model is this is a real, defensible problem. Drives the abstention gate (see
   *  `gate.ts`): a flag below the floor is dropped rather than shown. Parsed leniently. */
  confidence?: string;
  /** One-sentence, layperson explanation of what's wrong (empty when ok). */
  reason: string;
}

const SYSTEM_PROMPT =
  "You are an accessibility expert judging whether a HEADING meaningfully describes the section of " +
  "content it introduces, for a screen-reader user who navigates the page by jumping between " +
  "headings (WCAG 2.4.6 Headings and Labels). You are given the heading text and a clip of the " +
  "content that follows it. Judge ONE thing:\n" +
  "- uninformative-heading: the heading text does NOT describe its section — it is a vague, " +
  'placeholder, or boilerplate label ("More", "Info", "Section 1", "Untitled", "Heading", "Title", ' +
  '"Welcome"/"Overview" sitting on a real content section, "Click here", "Read more", "Lorem ipsum") ' +
  "that gives the user no idea what the section is about.\n" +
  "- ok: the heading is a reasonable label for its section, OR you lack enough section text to judge.\n" +
  "Be CONSERVATIVE and PRECISION-FIRST — only flag a CLEAR, defensible problem; under ANY doubt " +
  "answer ok. DO NOT FLAG:\n" +
  '- a SHORT but genuinely descriptive heading ("Pricing", "FAQ", "Contact us", "Our team", ' +
  '"Reviews", "Shipping") — terse is fine when it accurately names the section;\n' +
  "- a heading that accurately summarises its section even in a few words;\n" +
  '- a proper noun, product name, brand, person\'s name, or feature name used as a heading;\n' +
  '- "Welcome"/"Overview"/"Introduction" when the following section genuinely IS a welcome/intro;\n' +
  "- a heading you can't fairly judge because the section preview is empty or too thin;\n" +
  "- a word from the examples above when it is actually a proper noun, product/edition name, or " +
  'legal/program name that the section is genuinely about (e.g. "Section 8" the housing program, a ' +
  'product edition literally named "More") — judge the heading AGAINST its section, not the word in ' +
  "isolation.\n" +
  'Also rate your confidence that the problem is real: "high" = obvious/unambiguous, "medium" = ' +
  'likely but some doubt, "low" = a guess. When you answer ok, use "high". Reply ONLY with JSON: ' +
  '{"issue":"ok|uninformative-heading","confidence":"high|medium|low","reason":"..."} — reason is ' +
  "one plain sentence (empty when ok).";

/** ruleId / WCAG / impact for the single problem this judge emits. */
const RULE_ID = "heading-uninformative";
const WCAG = ["2.4.6", "1.3.1"];
const IMPACT: Finding["impact"] = "moderate";

/**
 * Ask GLM to judge whether one heading labels its section. Returns a Finding for a real problem, else
 * null. Exported (not just used by `runHeadingQualityJudge`) so the eval harness grades this EXACT
 * path — same prompt, model call, and parsing the production scan uses — rather than a drifting copy.
 * It must NOT touch a Playwright Page: it only builds a text context and calls the model.
 */
export async function judgeHeadingQuality(
  candidate: HeadingQualityCandidate,
): Promise<Finding | null> {
  const context = [
    `heading (h${candidate.level}): ${JSON.stringify(candidate.text)}`,
    candidate.precedingText
      ? `text just before the heading: ${JSON.stringify(candidate.precedingText)}`
      : null,
    `section it introduces: ${
      candidate.sectionPreview ? JSON.stringify(candidate.sectionPreview) : "(empty / none)"
    }`,
  ]
    .filter(Boolean)
    .join("\n");

  const rawResponse = await glmAsk([{ type: "text", text: context }], { system: SYSTEM_PROMPT });
  const verdict = parseJsonObject<Verdict>(rawResponse);
  if (verdict.issue !== "uninformative-heading") return null; // "ok" or unrecognised label → no flag
  // Abstention gate: a flag the model isn't sure enough about is dropped, not shown (see gate.ts).
  if (!meetsConfidence(parseConfidence(verdict.confidence))) return null;

  return {
    ruleId: RULE_ID,
    source: "ai",
    tier: 3,
    wcag: WCAG,
    impact: IMPACT,
    selector: candidate.selector,
    htmlSnippet: `<h${candidate.level}>${candidate.text}</h${candidate.level}>`,
    message:
      verdict.reason || "This heading does not describe the section of content it labels.",
  };
}

/**
 * Tier-3 entry point: run the AI heading-quality judge over a rendered page. No-ops (returns `[]`)
 * when no GLM key is configured, so the deterministic tiers work standalone. Each heading is judged
 * independently; a single failed judgment doesn't drop the rest.
 */
export async function runHeadingQualityJudge(page: Page): Promise<Finding[]> {
  if (!aiConfigured()) return [];
  const headings = await collectHeadings(page);
  if (headings.length === 0) return [];

  const results = await Promise.allSettled(headings.map((h) => judgeHeadingQuality(h)));
  const findings: Finding[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) findings.push(r.value);
    else if (r.status === "rejected") console.error("ai heading-quality judge failed:", r.reason);
  }
  return findings;
}
