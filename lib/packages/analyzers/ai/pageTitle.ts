/**
 * Tier-3 AI judge (text-only): page `<title>` QUALITY. The deterministic `document-title` check (axe,
 * Tier 1) only answers "is there a non-empty title at all?". It can't judge whether the title actually
 * describes the page — default scaffold titles ("Document", "React App", "Vite + React"), a bare
 * brand/site name with no page context, or a single generic word ("Home", "index") all pass axe but
 * leave a user staring at a tab/bookmark/search result that doesn't say what the page is.
 *
 * This judge reasons over TEXT the model can see: the title string, the page's first `<h1>`, the URL,
 * and the meta description. The h1/url/description are EVIDENCE of what the page is really about, so
 * the model can tell "the title doesn't match this page" apart from "this terse title is fine". No
 * pixels — GLM's coding-plan endpoint is text-only (see `glm.ts`).
 *
 * WCAG 2.4.2 (Page Titled), impact "serious". Missing-title-entirely is axe's `document-title`, NOT
 * ours: `collectPageTitle` skips when there is no title to judge.
 */
import type { Page } from "playwright";
import type { Finding } from "@web-access/shared";
import { ensureEvalHelpers } from "../util";
import { aiConfigured, glmAsk, parseJsonObject } from "./glm";
import { meetsConfidence, parseConfidence } from "./gate";

/** The page `<title>` and the surrounding text context we can give the model, collected in-page. */
export interface PageTitleCandidate {
  /** Always `"title"` — there is one `<title>` per page; this is what the Finding points at. */
  selector: string;
  /** `document.title`, trimmed (never empty here — `collectPageTitle` skips the empty case). */
  title: string;
  /** Text of the page's first `<h1>`, if any — the strongest hint of the page's real topic. */
  h1: string;
  /** Page URL — its path/slug is another hint of what the page is about. */
  url: string;
  /** `<meta name="description">` content, if any — extra evidence of the page's subject. */
  metaDescription: string;
}

/** Longest a title can be before we treat it as "probably descriptive" and skip the model call. */
const SUSPICIOUS_MAX_LEN = 40;
/** How much surrounding text we hand the model — enough to judge, capped to keep the prompt small. */
const MAX_CONTEXT = 300;

/**
 * Known default/scaffold titles and obviously-generic single words. A title that (case-insensitively)
 * EQUALS one of these is template boilerplate the author never replaced — a strong pre-filter signal.
 * The model still makes the final call; this just decides what's worth a (free but latency-costing)
 * judgment. Kept lowercase for comparison.
 */
const TEMPLATE_TITLES = new Set<string>([
  "document",
  "untitled",
  "untitled document",
  "untitled page",
  "react app",
  "vite app",
  "vite + react",
  "vite + react + ts",
  "create react app",
  "next app",
  "next.js app",
  "create next app",
  "webflow site",
  "webflow html website template",
  "home",
  "homepage",
  "index",
  "page",
  "new page",
  "title",
  "welcome",
  "my site",
  "my website",
  "website",
  "app",
  "blank",
]);

/**
 * Cheap DETERMINISTIC pre-filter: is this title suspicious enough to be worth a model call? We judge
 * only titles that look default/template-like, are very short, or are a single token — i.e. the cases
 * where "does it describe the page?" is genuinely in doubt. A clearly descriptive, multi-word title
 * (e.g. "Pricing — Acme", "How to install the SDK | Docs") is skipped to avoid the latency/cost of a
 * call we'd almost always answer "ok" to. The model handles the harder "bare brand name" judgment.
 */
function isSuspiciousTitle(title: string): boolean {
  const t = title.trim();
  if (TEMPLATE_TITLES.has(t.toLowerCase())) return true;
  if (t.length <= SUSPICIOUS_MAX_LEN) return true; // short titles are where bare-brand/generic hide
  return false;
}

/**
 * Collect the page `<title>` and its text context — 0 or 1 candidate. Returns `[]` when there is no
 * title at all (that is axe's `document-title`, Tier 1, not this judge) or when the title is clearly
 * descriptive (the pre-filter — not worth a model call).
 */
export async function collectPageTitle(page: Page): Promise<PageTitleCandidate[]> {
  await ensureEvalHelpers(page); // shim esbuild's __name into the page (see util.ts)
  const candidate = await page.evaluate(
    ({ maxContext }) => {
      const clip = (s: string | null | undefined, n: number) =>
        (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

      const title = clip(document.title, 200);
      if (!title) return null; // no title → axe's document-title owns it, not us

      const h1 = clip(document.querySelector("h1")?.textContent, maxContext);
      const metaDescription = clip(
        document.querySelector('meta[name="description"]')?.getAttribute("content"),
        maxContext,
      );
      return { selector: "title", title, h1, url: location.href, metaDescription };
    },
    { maxContext: MAX_CONTEXT },
  );

  if (!candidate) return [];
  if (!isSuspiciousTitle(candidate.title)) return []; // descriptive enough — skip the model call
  return [candidate];
}

/** The judge's verdict for one page title. */
interface Verdict {
  /** `"ok"` = the title adequately describes the page (or there isn't enough evidence to be sure). */
  issue: "ok" | "uninformative-title";
  /** How sure the model is this is a real, defensible problem. Drives the abstention gate (see
   *  `gate.ts`): a flag below the floor is dropped rather than shown. Parsed leniently. */
  confidence?: string;
  /** One-sentence, layperson explanation of what's wrong (empty when ok). */
  reason: string;
}

const SYSTEM_PROMPT =
  "You are an accessibility expert judging whether a web page's <title> describes the page's topic " +
  "or purpose (WCAG 2.4.2). The title is what users see in the browser tab, in bookmarks, in their " +
  "history, and in search results, so it must identify THIS page. You are given the title plus " +
  "evidence of what the page is actually about: its first <h1>, its URL, and its meta description.\n" +
  "Flag uninformative-title ONLY when the title clearly fails to describe the page:\n" +
  '- a default/scaffold title the author never replaced ("Document", "Untitled", "React App", ' +
  '"Vite + React", "Create Next App", "Webflow Site", "index", "Home", "page").\n' +
  "- a BARE site/brand name alone with no page context, when the h1/URL show this is a specific " +
  '(non-home) page — e.g. title "Acme" on a page whose h1 is "Pricing".\n' +
  "- a single generic word that names no specific topic.\n" +
  "DO NOT FLAG (these are fine — answer ok):\n" +
  '- a descriptive title, even a short one ("Pricing — Acme", "How to install the SDK | Docs", ' +
  '"Contact us").\n' +
  "- a brand/site name FOLLOWED (or preceded) by a real page descriptor — the brand being present " +
  "is GOOD, not a problem; only flag a brand name that stands ALONE with no descriptor. But a brand " +
  "appended to a scaffold/generic title does NOT rescue it: judge the NON-brand part — if that part " +
  'is itself uninformative ("React App — Acme", "Home | Acme" on a specific non-home page), still ' +
  "flag.\n" +
  '- "Home"/"Homepage" when the page genuinely IS the site\'s home/landing page (the URL is the root ' +
  'and/or the h1 is a welcome/brand line) — a home page titled "Home" is acceptable.\n' +
  "- any case where the h1/URL/description don't give you enough to be sure the title is wrong.\n" +
  "Be conservative — only flag a CLEAR, defensible problem; default to ok under ANY doubt. Also rate " +
  'your confidence that the problem is real: "high" = obvious/unambiguous, "medium" = likely but some ' +
  'doubt, "low" = a guess. When you answer ok, use "high". Reply ONLY with JSON: ' +
  '{"issue":"ok|uninformative-title","confidence":"high|medium|low","reason":"..."} — reason is one ' +
  "plain sentence (empty when ok).";

/** ruleId/impact for the single problem this judge can emit (WCAG 2.4.2). */
const RULE_ID = "page-title-uninformative";

/**
 * Ask GLM to judge whether the page title describes the page. Returns a Finding for a real problem,
 * else null. Page-free and EXPORTED so the eval harness grades this EXACT path — same prompt, model
 * call, and parsing the production scan uses — rather than a drifting copy. Never touches a Page.
 */
export async function judgePageTitle(candidate: PageTitleCandidate): Promise<Finding | null> {
  const context = [
    `title: ${JSON.stringify(candidate.title)}`,
    candidate.h1 ? `page h1: ${JSON.stringify(candidate.h1)}` : `page h1: (none)`,
    candidate.url ? `url: ${candidate.url}` : null,
    candidate.metaDescription ? `meta description: ${JSON.stringify(candidate.metaDescription)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await glmAsk([{ type: "text", text: context }], { system: SYSTEM_PROMPT });
  const verdict = parseJsonObject<Verdict>(raw);
  if (verdict.issue !== "uninformative-title") return null; // "ok" or any unrecognised label → no flag
  // Abstention gate: a flag the model isn't sure enough about is dropped, not shown (see gate.ts).
  if (!meetsConfidence(parseConfidence(verdict.confidence))) return null;

  return {
    ruleId: RULE_ID,
    source: "ai",
    tier: 3,
    wcag: ["2.4.2"],
    impact: "serious",
    selector: candidate.selector,
    htmlSnippet: `<title>${candidate.title}</title>`,
    message: verdict.reason || "The page title does not describe what this page is about.",
  };
}

/**
 * Tier-3 entry point: run the AI page-title quality judge over a rendered page. No-ops (returns `[]`)
 * when no GLM key is configured, so the deterministic tiers work standalone. There is at most one
 * candidate, but we still use `Promise.allSettled` so a failed/timed-out judgment surfaces as a
 * logged error rather than a thrown scan.
 */
export async function runPageTitleJudge(page: Page): Promise<Finding[]> {
  if (!aiConfigured()) return [];
  const candidates = await collectPageTitle(page);
  if (candidates.length === 0) return [];

  const results = await Promise.allSettled(candidates.map((c) => judgePageTitle(c)));
  const findings: Finding[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) findings.push(r.value);
    else if (r.status === "rejected") console.error("ai page-title judge failed:", r.reason);
  }
  return findings;
}
