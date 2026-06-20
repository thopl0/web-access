/**
 * Tier-3 AI judge (text-only): ambiguous repeated links (WCAG 2.4.4, "Link Purpose (In Context)").
 *
 * Screen-reader users routinely pull up a flat list of every link on a page and navigate it by name.
 * When several links share the SAME accessible name but lead to DIFFERENT destinations — five
 * "Download" links to five different files, a column of "Read more" links to different articles —
 * that list reads as "Download, Download, Download…", and the user has no way to tell them apart or
 * pick the one they want. The deterministic tiers can't catch this: every link individually has a
 * perfectly valid name (axe's `link-name` passes); the problem only exists across the SET.
 *
 * So this judge is SET-BASED. The candidate is a GROUP of links that share one normalised name and
 * point at 2+ distinct destinations. The model's job is to decide whether that group is genuinely
 * ambiguous, or whether each link's SURROUNDING context already disambiguates it (a "Read more" that
 * sits under its own article heading is fine — the in-context purpose is clear, which is exactly what
 * 2.4.4 permits). It reasons over TEXT only: the shared name, the distinct hrefs, and the per-link
 * surrounding text. No pixels — GLM's coding-plan endpoint is text-only (see `glm.ts`).
 */
import type { Page } from "playwright";
import type { Finding } from "@web-access/shared";
import { ensureEvalHelpers } from "../util";
import { aiConfigured, glmAsk, parseJsonObject } from "./glm";
import { meetsConfidence, parseConfidence } from "./gate";

/** A group of visible links that share one accessible name but point to different destinations. */
export interface RepeatedLinkGroup {
  /** The shared, normalised accessible name every link in the group exposes (e.g. "Read more"). */
  linkText: string;
  /** The DISTINCT destinations the group points at — 2+ by construction (that's what makes it a group). */
  destinations: string[];
  /** How many links carry this name (≥ destinations.length; some may repeat a destination). */
  occurrences: number;
  /** Each link's surrounding text — the in-context cue that may (or may not) already disambiguate it. */
  contexts: string[];
  /** Selector of the FIRST occurrence — where we point the finding. */
  selector: string;
}

/** Cap how many groups we send — each is a model call (plan: free GLM, but latency-costing). */
const MAX_GROUPS = 10;
/** Per-link context is the only disambiguation signal; clip generously but bound the prompt size. */
const MAX_CONTEXT_LINKS = 8;

/**
 * Collect groups of visible links that share an accessible name but point to 2+ distinct destinations.
 * This is the cheap DETERMINISTIC pre-filter: a link group with one destination (a logo repeated in
 * header + footer) or a unique name is never sent to the model — only genuinely repeated-name,
 * multi-destination groups, which are the only ones that CAN be ambiguous, reach the judge.
 */
export async function collectRepeatedLinkGroups(page: Page): Promise<RepeatedLinkGroup[]> {
  await ensureEvalHelpers(page); // shim esbuild's __name into the page (see util.ts)
  const groups = await page.evaluate(() => {
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

    /** The accessible name a screen reader would announce for this link. */
    function accessibleName(a: HTMLAnchorElement): string {
      const aria = a.getAttribute("aria-label");
      if (aria && aria.trim()) return aria.trim();
      // aria-labelledby: concatenate the referenced elements' text.
      const labelledby = a.getAttribute("aria-labelledby");
      if (labelledby) {
        const text = labelledby
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? "")
          .join(" ");
        if (text.trim()) return text.replace(/\s+/g, " ").trim();
      }
      // Visible text, then alt of a sole child image (image-only link), then title.
      const visible = clip(a.textContent, 200);
      if (visible) return visible;
      const img = a.querySelector("img[alt]");
      const alt = img?.getAttribute("alt")?.trim();
      if (alt) return alt;
      return clip(a.getAttribute("title"), 200);
    }

    /** Surrounding text that gives the link its in-context purpose: nearest heading/list-item/etc. */
    function surroundingText(a: HTMLAnchorElement, name: string): string {
      // Walk up to a sensible container (a card/list item/section), then take its text minus the link's
      // own name, so the cue we judge is the CONTEXT, not the link text repeated back at us.
      const container =
        a.closest("li, article, section, figure, td, th, [role='listitem'], .card") ?? a.parentElement;
      const raw = clip(container?.textContent, 240);
      const withoutName = raw.replace(name, " ").replace(/\s+/g, " ").trim();
      return withoutName.slice(0, 200);
    }

    // Group visible links by normalised accessible name.
    const byName = new Map<
      string,
      { display: string; entries: Array<{ href: string; context: string; selector: string }> }
    >();
    for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
      const r = a.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue; // not laid out / hidden
      const s = getComputedStyle(a);
      if (s.visibility === "hidden" || s.display === "none") continue;
      const href = a.href; // resolved absolute URL
      if (!href || href.startsWith("javascript:")) continue;
      const display = accessibleName(a);
      if (!display) continue; // nameless link — that's axe's link-name job, not ours
      const key = display.toLowerCase().replace(/\s+/g, " ").trim();
      const bucket = byName.get(key) ?? { display, entries: [] };
      bucket.entries.push({ href, context: surroundingText(a, display), selector: cssPath(a) });
      byName.set(key, bucket);
    }

    const out: Array<{
      linkText: string;
      destinations: string[];
      occurrences: number;
      contexts: string[];
      selector: string;
    }> = [];
    for (const { display, entries } of byName.values()) {
      if (entries.length < 2) continue; // not repeated at all
      const destinations = Array.from(new Set(entries.map((e) => e.href)));
      if (destinations.length < 2) continue; // same name AND same destination → not ambiguous, skip
      out.push({
        linkText: display,
        destinations,
        occurrences: entries.length,
        contexts: entries.slice(0, 8).map((e) => e.context).filter(Boolean),
        selector: entries[0]!.selector,
      });
    }
    return out;
  });

  return groups.slice(0, MAX_GROUPS);
}

/** The judge's verdict for one link group. */
interface Verdict {
  issue: "ok" | "ambiguous-repeated-links";
  /** How sure the model is this is a real, defensible problem. Drives the abstention gate (see
   *  `gate.ts`): a flag below the floor is dropped rather than shown. Parsed leniently. */
  confidence?: string;
  /** One-sentence, layperson explanation of what's wrong (empty when ok). */
  reason: string;
}

const RULE_ID = "ambiguous-repeated-links";

const SYSTEM_PROMPT =
  "You are an accessibility expert judging WCAG 2.4.4 (Link Purpose) for a blind screen-reader user, " +
  "using ONLY the text given (you cannot see the page). You are shown ONE GROUP of links that all " +
  "share the SAME visible/accessible name but point to DIFFERENT destinations, plus the text " +
  "surrounding each link. A screen-reader user can pull up a flat list of links by name, where these " +
  'all read identically (e.g. "Read more, Read more, Read more").\n' +
  "CRITICAL: the destination URL/path is NEVER announced to the user — they hear ONLY the shared name " +
  "and, at most, the visible surrounding text. So destinations differing only in their PATH is NOT " +
  "disambiguation; ONLY the NAME itself or the visible CONTEXT can tell the links apart.\n" +
  "Flag issue \"ambiguous-repeated-links\" ONLY when the shared name is genuinely undistinguishable: " +
  "the name itself carries nothing to tell the destinations apart (e.g. several \"Download\", \"Read " +
  "more\", \"Click here\", \"Learn more\", \"View\" links to different targets) AND the surrounding " +
  "context does NOT clearly disambiguate them.\n" +
  "DO NOT FLAG (answer ok) any of these:\n" +
  "- The surrounding context already makes each link's purpose clear (e.g. a \"Read more\" that sits " +
  "under its own distinct article heading/title — 2.4.4 allows in-context purpose).\n" +
  "- Pagination or sequential numbers (\"1\", \"2\", \"3\") — the number IS the distinguishing label.\n" +
  "- \"Next\"/\"Previous\"/\"Back\"/\"Forward\"/\"Next page\"/\"Previous page\" sequential navigation — " +
  "conventional and clear (match the INTENT, not the exact word or language). Pager links are EXPECTED " +
  "to point at different pages of different lists (e.g. a blog pager's Next and a gallery pager's Next): " +
  "that variety is the pager working normally, NOT ambiguity. Treat a Next/Previous group as a pager " +
  "(answer ok) UNLESS the destinations are clearly unrelated step-flows that happen to reuse the word — " +
  "e.g. an onboarding step, a checkout step, and a survey step — which is the ONLY case to flag.\n" +
  "- Destinations that differ ONLY by query string or by #fragment (e.g. tracking params like ?utm=, a " +
  "sort/filter, or an in-page #anchor) and that share the SAME base URL/path are the SAME page or " +
  "section reached different ways — there is NOTHING for the user to disambiguate, so answer ok. This " +
  "applies in full to 'back to top'/table-of-contents/in-page anchor links (e.g. \"Top\" pointing at " +
  "/guide#section-1, /guide#section-2, …): every target is the same document, so it is conventional " +
  "navigation, NOT destination ambiguity — do NOT flag it.\n" +
  "- Links whose shared NAME is already specific and self-describing — it names a concrete document, " +
  "product, report, or topic (e.g. \"iPhone 15 Pro\", \"2024 Annual Report (PDF)\") — answer ok EVEN " +
  "WHEN the surrounding context is empty, because the announced name ALONE already tells the user what " +
  "the link is for; the different destinations are just variants (color, screen/print, sort) of that " +
  "one named thing. Only treat a name as non-specific when it is a generic call-to-action that names " +
  "nothing (\"Read more\", \"Download\", \"View\", \"Learn more\", \"here\", \"Click here\").\n" +
  "- Any case where you lack enough text to be sure it's ambiguous — default to ok.\n" +
  "Two cautions that cut BOTH ways: (a) context only disambiguates when it actually DIFFERS per link " +
  "and names the target — identical boilerplate repeated under every link (e.g. the same \"3 min read, " +
  "share\" footer) disambiguates nothing; (b) a longer phrase is not automatically specific — \"Read the " +
  "full story\" carries no more per-target meaning than \"Read more\". Judge by whether a blind user could " +
  "actually tell the targets apart, in any language, not by phrase length or English keyword matching.\n" +
  "Be conservative: only flag a CLEAR, defensible problem; under ANY doubt answer ok. Also rate your " +
  'confidence that the problem is real: "high" = obvious/unambiguous, "medium" = likely but some ' +
  'doubt, "low" = a guess. When you answer ok, use "high". Reply ONLY with JSON: ' +
  '{"issue":"ok|ambiguous-repeated-links","confidence":"high|medium|low","reason":"..."} — reason is ' +
  "one plain sentence naming the shared link text (empty when ok).";

/**
 * Ask GLM to judge whether one repeated-link group is genuinely ambiguous. Returns a Finding for a
 * real problem, else null. Exported (not just used by `runRepeatedLinksJudge`) so the eval harness
 * grades this EXACT path — same prompt, model call, and parsing the production scan uses — rather than
 * a drifting copy. Takes the group directly and never touches a Playwright Page.
 */
export async function judgeRepeatedLinks(group: RepeatedLinkGroup): Promise<Finding | null> {
  // Defensive: a group that isn't actually multi-destination can't be ambiguous (collect already
  // filters these, but the eval harness drives the judge with arbitrary inputs).
  if (group.destinations.length < 2) return null;

  const contexts = group.contexts.slice(0, MAX_CONTEXT_LINKS);
  const context = [
    `shared link name: ${JSON.stringify(group.linkText)}`,
    `occurrences: ${group.occurrences}`,
    `distinct destinations (${group.destinations.length}): ${group.destinations
      .slice(0, MAX_CONTEXT_LINKS)
      .map((d) => JSON.stringify(d))
      .join(", ")}`,
    contexts.length
      ? `surrounding text for each link:\n${contexts.map((c, i) => `  ${i + 1}. ${JSON.stringify(c)}`).join("\n")}`
      : "surrounding text for each link: (none captured)",
  ].join("\n");

  const raw = await glmAsk([{ type: "text", text: context }], { system: SYSTEM_PROMPT });
  const verdict = parseJsonObject<Verdict>(raw);
  if (verdict.issue !== RULE_ID) return null; // "ok" or any unrecognised label — no finding
  // Abstention gate: a flag the model isn't sure enough about is dropped, not shown (see gate.ts).
  if (!meetsConfidence(parseConfidence(verdict.confidence))) return null;

  return {
    ruleId: RULE_ID,
    source: "ai",
    tier: 3,
    wcag: ["2.4.4"],
    impact: "moderate",
    selector: group.selector,
    htmlSnippet: `<a href="…">${group.linkText}</a> ×${group.occurrences} → ${group.destinations.length} destinations`,
    message:
      verdict.reason ||
      `Several "${group.linkText}" links point to different places but read identically to a screen reader.`,
  };
}

/**
 * Tier-3 entry point: run the AI repeated-links judge over a rendered page. No-ops (returns `[]`) when
 * no GLM key is configured, so the deterministic tiers work standalone. Each group is judged
 * independently under `Promise.allSettled`, so a single failed/timed-out judgment never drops the rest.
 */
export async function runRepeatedLinksJudge(page: Page): Promise<Finding[]> {
  if (!aiConfigured()) return [];
  const groups = await collectRepeatedLinkGroups(page);
  if (groups.length === 0) return [];

  const results = await Promise.allSettled(groups.map((g) => judgeRepeatedLinks(g)));
  const findings: Finding[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) findings.push(r.value);
    else if (r.status === "rejected") console.error("ai repeated-links judge failed:", r.reason);
  }
  return findings;
}
