/**
 * Tier-3 AI judge (text-only): link purpose in context (WCAG 2.4.4). The deterministic `link-name`
 * check (axe, Tier 1) only answers "does this link have ANY accessible name at all?". A link can pass
 * that and still be useless to a screen-reader user: "click here", "read more", "learn more", "this",
 * or a bare URL all HAVE a name — it just doesn't say where the link goes.
 *
 * WCAG 2.4.4 deliberately allows that name to be disambiguated by its CONTEXT (the enclosing sentence,
 * list item, paragraph, or a nearby heading). So a bare "Read more" right under a heading that names
 * the article is FINE. This judge therefore reasons over the link text PLUS that surrounding context,
 * and flags only when the destination stays genuinely unclear with the context in hand.
 *
 * No pixels — GLM's coding-plan endpoint is text-only (see `glm.ts`), which is all this needs: link
 * purpose is a text-and-structure judgment, not a visual one.
 */
import type { Page } from "playwright";
import type { Finding } from "@web-access/shared";
import { ensureEvalHelpers } from "../util";
import { aiConfigured, glmAsk, parseJsonObject } from "./glm";
import { meetsConfidence, parseConfidence } from "./gate";

/** A link with a generic/short/url-like name, plus the context WCAG 2.4.4 lets us use to judge it. */
export interface LinkPurposeCandidate {
  selector: string;
  /** The link's accessible name (visible text, or aria-label/title fallback) — the thing announced. */
  linkText: string;
  /** Destination, if any — a bare URL as the *name* is itself a 2.4.4 problem, but the href can also
   *  be the only purpose hint when the name is generic. */
  href: string;
  /** Surrounding text the user effectively has: enclosing sentence/list-item/paragraph + nearest
   *  preceding heading. This is what turns a generic "read more" into a defensible link or not. */
  context: string;
  /** `aria-label` / `title`, if present — an author-supplied purpose that can fully disambiguate. */
  ariaLabel: string;
  /** The link sits inside a list or nav landmark — its siblings/heading often supply the purpose. */
  inListOrNav: boolean;
}

/** Cap how many links we send — each is a (free but latency-costing) model call. */
const MAX_LINKS = 25;

/**
 * Generic / ambiguous accessible names worth a model call. A link whose name is clearly descriptive
 * (e.g. "View 2024 pricing") is NOT sent — only names that are too short, too generic, or url-like
 * pass the deterministic pre-filter, because only those can plausibly fail 2.4.4.
 */
const GENERIC_NAME = new RegExp(
  "^(?:" +
    [
      "click here",
      "click",
      "here",
      "read more",
      "read",
      "learn more",
      "more",
      "see more",
      "more info",
      "more details",
      "details",
      "this",
      "this link",
      "link",
      "go",
      "view",
      "open",
      "download",
      "continue",
      "next",
      "info",
    ].join("|") +
    ")$",
  "i",
);

/** Collect links whose accessible name is generic/short/url-like — the only ones worth judging. */
export async function collectLinks(page: Page): Promise<LinkPurposeCandidate[]> {
  await ensureEvalHelpers(page); // shim esbuild's __name into the page (see util.ts)
  const raw = await page.evaluate(
    ({ genericSource }) => {
      const genericRe = new RegExp(genericSource, "i");

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

      /** Does the accessible name look url-like (a bare URL or naked domain)? */
      const urlLike = (s: string) =>
        /^(?:https?:\/\/|www\.)\S+$/i.test(s) || /^[\w-]+(?:\.[\w-]+){1,}\/?\S*$/i.test(s);

      const out = [];
      for (const a of Array.from(document.querySelectorAll("a[href]"))) {
        const s = getComputedStyle(a);
        if (s.visibility === "hidden" || s.display === "none") continue;

        const ariaLabel = clip(a.getAttribute("aria-label") || a.getAttribute("title"), 200);
        // Accessible name: aria-label/title win over visible text (that's what's announced).
        const visible = clip(a.textContent, 200);
        const name = ariaLabel || visible;
        if (!name) continue; // no accessible name at all is axe's `link-name`, not ours

        // Deterministic pre-filter: only generic, very short, or url-like names can fail 2.4.4.
        const generic = genericRe.test(name);
        const short = name.length <= 4; // "go", "this", "info" etc.
        if (!generic && !short && !urlLike(name)) continue;

        // Immediate context WCAG 2.4.4 allows us to use.
        const li = a.closest("li");
        const block = a.closest("p, li, figcaption, td, dd, blockquote, article");
        let heading = "";
        const scan: Element | null = a.closest("section, article, div") || a.parentElement;
        // Walk preceding siblings/ancestors for the nearest heading above this link.
        let node: Element | null = a;
        for (let hops = 0; node && hops < 6; hops++) {
          let prev: Element | null = node.previousElementSibling;
          while (prev) {
            if (/^H[1-6]$/.test(prev.tagName)) {
              heading = clip(prev.textContent, 160);
              break;
            }
            const inner = prev.querySelector?.("h1, h2, h3, h4, h5, h6");
            if (inner) heading = clip(inner.textContent, 160);
            prev = prev.previousElementSibling;
          }
          if (heading) break;
          node = node.parentElement;
        }
        void scan;

        const contextText = clip(block?.textContent, 400);

        out.push({
          selector: cssPath(a),
          linkText: name,
          href: clip(a.getAttribute("href"), 200),
          context: [heading ? `heading: ${heading}` : "", contextText]
            .filter(Boolean)
            .join(" — ")
            .slice(0, 500),
          ariaLabel,
          inListOrNav: li !== null || a.closest("nav") !== null,
        });
      }
      return out;
    },
    { genericSource: GENERIC_NAME.source },
  );

  return raw.slice(0, MAX_LINKS);
}

/** The judge's verdict for one link. */
interface Verdict {
  issue: "ok" | "link-purpose-unclear";
  /** How sure the model is this is a real, defensible problem. Drives the abstention gate (see
   *  `gate.ts`): a flag below the floor is dropped rather than shown. Parsed leniently. */
  confidence?: string;
  /** One-sentence, layperson explanation of what's wrong (empty when ok). */
  reason: string;
}

const SYSTEM_PROMPT =
  "You are an accessibility expert judging LINK PURPOSE for a blind screen-reader user (WCAG 2.4.4). " +
  "A screen-reader user often pulls up a list of just the links on a page, so each link's purpose " +
  "must be clear from its accessible name TOGETHER WITH its immediate context (the surrounding " +
  "sentence/list-item, the nearest heading, and any aria-label). You are given exactly that context.\n" +
  "Flag link-purpose-unclear ONLY when, even WITH the context provided, a user could not tell where " +
  'the link goes or what it does — e.g. "click here", "read more", "learn more", "more", "here", ' +
  '"this", "details", "link", or a bare URL with NO surrounding text that names the destination.\n' +
  "DO NOT FLAG (these are FINE):\n" +
  "- a generic phrase that the context disambiguates: e.g. \"Read more\" right under a heading or in a " +
  "card whose text names the article/product (the context tells the user the destination).\n" +
  "- a link with a genuinely descriptive accessible name (e.g. \"View 2024 pricing\", \"Download the " +
  'annual report").\n' +
  "- an aria-label that supplies the purpose (e.g. aria-label \"Read more about pricing\") — judge the " +
  "aria-label, not the bare visible text.\n" +
  "- any case where the context plausibly makes the destination clear. When in doubt, answer ok.\n" +
  "Context only rescues a generic link when it actually NAMES the destination. The mere PRESENCE of a " +
  "heading, sentence, or list does not — a generic heading (\"Related articles\", \"Latest\") or pure " +
  "call-to-action copy (\"Ready to grow? Take the next step\") that never names where the link goes, and " +
  "a shortened/opaque URL (e.g. a bit.ly slug) that reads as gibberish aloud, still leave the purpose " +
  "unclear. Likewise an aria-label only rescues the link if the aria-label ITSELF names the destination " +
  "(a generic aria-label like \"click here\" does not).\n" +
  "Be conservative — only flag a CLEAR, defensible problem. Also rate your confidence that the " +
  'problem is real and a screen-reader user would agree: "high" = obvious/unambiguous, "medium" = ' +
  'likely but some doubt, "low" = a guess. When you answer ok, use "high". Reply ONLY with JSON: ' +
  '{"issue":"ok|link-purpose-unclear","confidence":"high|medium|low","reason":"..."} — reason is one ' +
  "plain sentence (empty when ok).";

const RULE_ID = "link-purpose-unclear";

/**
 * Ask GLM to judge one link's purpose-in-context. Returns a Finding for a real problem, else null.
 * Exported (not just used by `runLinkPurposeJudge`) so the eval harness grades this EXACT path — same
 * prompt, model call, and parsing the production scan uses — rather than a drifting copy. Page-free:
 * it consumes only a candidate, so the harness can drive it directly from the corpus.
 */
export async function judgeLinkPurpose(candidate: LinkPurposeCandidate): Promise<Finding | null> {
  const context = [
    `link text (announced name): ${JSON.stringify(candidate.linkText)}`,
    candidate.href ? `href: ${candidate.href}` : null,
    candidate.ariaLabel ? `aria-label/title: ${JSON.stringify(candidate.ariaLabel)}` : null,
    candidate.context
      ? `surrounding context: ${JSON.stringify(candidate.context)}`
      : "surrounding context: (none)",
    candidate.inListOrNav ? "appears inside a list or navigation" : null,
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await glmAsk([{ type: "text", text: context }], { system: SYSTEM_PROMPT });
  const verdict = parseJsonObject<Verdict>(raw);
  if (verdict.issue !== RULE_ID) return null; // "ok" or any unrecognised label — abstain
  // Abstention gate: a flag the model isn't sure enough about is dropped, not shown (see gate.ts).
  if (!meetsConfidence(parseConfidence(verdict.confidence))) return null;

  return {
    ruleId: RULE_ID,
    source: "ai",
    tier: 3,
    wcag: ["2.4.4"],
    impact: "moderate",
    selector: candidate.selector,
    htmlSnippet: `<a href=${JSON.stringify(candidate.href || "…")}>${candidate.linkText}</a>`,
    message:
      verdict.reason ||
      "It isn't clear where this link goes from its text and surrounding context.",
  };
}

/**
 * Tier-3 entry point: run the AI link-purpose judge over a rendered page. No-ops (returns `[]`) when
 * no GLM key is configured, so the deterministic tiers work standalone. Each link is judged
 * independently with `Promise.allSettled` isolation; a single failed/timed-out judgment never drops
 * the rest, and rejected reasons are logged.
 */
export async function runLinkPurposeJudge(page: Page): Promise<Finding[]> {
  if (!aiConfigured()) return [];
  const links = await collectLinks(page);
  if (links.length === 0) return [];

  const results = await Promise.allSettled(links.map((link) => judgeLinkPurpose(link)));
  const findings: Finding[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) findings.push(r.value);
    else if (r.status === "rejected") console.error("ai link-purpose judge failed:", r.reason);
  }
  return findings;
}
