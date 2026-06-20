/**
 * Headline remediation generator: turn a scan's accessibility findings into ONE paste-ready message
 * tailored to the site owner's PLATFORM — the product's distribution wedge.
 *
 *   - AI builder (Lovable, v0, Bolt, Replit, Cursor, Framer): a single copy-paste PROMPT the owner
 *     pastes back into their builder to fix everything, referencing each element by its visible
 *     text/purpose (never a raw CSS selector) and including the corrected snippet when we have one.
 *   - CMS / site builder (Wix, WordPress, Webflow, Squarespace, "other"): numbered, platform-specific
 *     click-path STEPS the owner follows in the editor.
 *
 * The branch is decided once by `isAiBuilder` from `lib/platform.ts` (the single source of truth for
 * the platform set). We dedupe trivially, cap worst-first by impact, and group by page → rule so the
 * model (and the template) emit a tight, readable document.
 *
 * ONE batched `glmAsk` per call (mirrors `ai/enrich.ts` / `fix/ai.ts`: one GLM round-trip, a
 * precision-biased system prompt). And — the contract a route depends on — this function NEVER throws:
 * when the AI tier is unconfigured OR the GLM call fails for any reason, it returns a deterministic
 * TEMPLATE document assembled with no model call (`source: "template"`), so the caller always gets a
 * usable prompt. The platform/source-only nature of the fallback is what the unit test asserts on.
 */
import type { Platform } from "../../../platform";
import { isAiBuilder, isPlatform, PLATFORM_LABELS } from "../../../platform";
import { aiConfigured, glmAsk } from "../ai/glm";

/**
 * One finding fed to the generator. A flattened, model-friendly projection of the report's
 * element-level data (`ElementFix` / `IssueElement` in `lib/server/report.ts`): the caller resolves
 * plain-language `what`/`fix` (e.g. from `lib/explain.ts` or the AI explanation) and the optional
 * `before`/`after` markup before handing issues here.
 */
export interface BuilderPromptIssue {
  /** Stable rule id, e.g. "image-alt". */
  ruleId: string;
  /** WCAG success criteria this maps to, e.g. ["1.1.1"]. */
  wcag: string[];
  /** axe-style severity, or null when the source doesn't grade impact. */
  impact: string | null;
  /** Concrete page url the issue was found on. */
  pageUrl: string;
  /** CSS selector to the element — used only to dedupe; never shown to an AI builder. */
  selector: string;
  /** Plain-language description of what's wrong with this element. */
  what: string;
  /** Plain-language description of how to fix it. */
  fix: string;
  /** Original element markup, when available. */
  before?: string;
  /** Corrected element markup the owner can paste in, when one was generated. */
  after?: string;
}

export interface BuilderPromptResult {
  /** The platform the message was written for (echoes the requested platform string). */
  platform: string;
  /** The finished paste-ready document (a copy-paste prompt, or numbered steps). */
  prompt: string;
  /** `"ai"` when GLM wrote it; `"template"` when assembled deterministically (no model call). */
  source: "ai" | "template";
  /** How many distinct issues the document covers (post-dedupe, post-cap). */
  issueCount: number;
}

/** Cap issues per document to bound tokens/latency and keep the paste-back digestible. Worst-first,
 *  so when a site has more than this the most severe issues are the ones that make the cut. */
const MAX_ISSUES = 40;

/** axe severity → sort rank (lower = worse). Self-contained so this module stays standalone (the
 *  analyzers package must not import app-side `lib/severity.ts`). Unknown/absent impact sorts last. */
const IMPACT_RANK: Record<string, number> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
};

function impactRank(impact: string | null): number {
  return impact ? (IMPACT_RANK[impact] ?? 99) : 99;
}

/** Strip the origin so a page reads as a path (e.g. "/pricing"); falls back to the raw value. */
function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return (u.pathname + u.search) || "/";
  } catch {
    return url;
  }
}

/**
 * A page's worth of grouped issues: the page path, then one entry per rule with every issue under it.
 * The shape both the AI payload and the template walk.
 */
interface PageGroup {
  path: string;
  rules: RuleGroup[];
}
interface RuleGroup {
  ruleId: string;
  wcag: string[];
  impact: string | null;
  issues: BuilderPromptIssue[];
}

/**
 * Dedupe (by page + rule + selector + before), cap worst-first by impact, and group by page → rule.
 * Pure — shared by the AI and template paths so both operate on exactly the same selection of issues.
 */
function prepare(issues: BuilderPromptIssue[]): { pages: PageGroup[]; count: number } {
  // Trivial dedupe: the same element flagged for the same rule on the same page is one issue.
  const seen = new Set<string>();
  const deduped: BuilderPromptIssue[] = [];
  for (const it of issues) {
    const key = `${it.pageUrl}\n${it.ruleId}\n${it.selector}\n${it.before ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(it);
  }

  // Worst-first, then cap — so an over-cap site keeps its most severe issues.
  deduped.sort((a, b) => impactRank(a.impact) - impactRank(b.impact));
  const capped = deduped.slice(0, MAX_ISSUES);

  // Group by page (preserving first-seen order), then by rule within a page.
  const byPage = new Map<string, Map<string, RuleGroup>>();
  const pageOrder: string[] = [];
  for (const it of capped) {
    const path = pathOf(it.pageUrl);
    let rules = byPage.get(path);
    if (!rules) {
      rules = new Map();
      byPage.set(path, rules);
      pageOrder.push(path);
    }
    let rule = rules.get(it.ruleId);
    if (!rule) {
      rule = { ruleId: it.ruleId, wcag: it.wcag, impact: it.impact, issues: [] };
      rules.set(it.ruleId, rule);
    }
    // Keep the worst impact seen for the rule (defensive — usually consistent).
    if (impactRank(it.impact) < impactRank(rule.impact)) rule.impact = it.impact;
    rule.issues.push(it);
  }

  const pages: PageGroup[] = pageOrder.map((path) => ({
    path,
    rules: [...byPage.get(path)!.values()].sort((a, b) => impactRank(a.impact) - impactRank(b.impact)),
  }));
  return { pages, count: capped.length };
}

/** Resolve the requested platform string to a known `Platform`, defaulting to `"other"`
 *  (CMS-style instructions) for anything unrecognised so the generator is always total. */
function resolvePlatform(platform: string): Platform {
  return isPlatform(platform) ? platform : "other";
}

const SYSTEM_PROMPT_AI_BUILDER =
  "You write ONE copy-paste PROMPT that a non-technical site owner will paste back into their AI " +
  "website builder (Lovable, v0, Bolt, Replit, Cursor, Framer) to fix every listed accessibility " +
  "issue at once. You are given the builder's name, the site name, and issues grouped by page then " +
  "rule; each issue has a plain-language description, a fix, and sometimes the corrected HTML " +
  "snippet.\n" +
  "WRITE THE PROMPT SO THAT:\n" +
  "- It is addressed to the builder in the second person (\"Fix the following accessibility issues " +
  "on my site...\"), ready to paste verbatim — no preamble to the owner, no \"here's a prompt\".\n" +
  "- It refers to each element by its VISIBLE TEXT or PURPOSE (e.g. \"the 'Subscribe' button\", " +
  "\"the hero image\"), NEVER by a CSS selector, rule id, or WCAG number.\n" +
  "- It is organised by page so the builder knows where to look.\n" +
  "- When an issue includes corrected HTML, instruct the builder to use that exact markup.\n" +
  "- It is precise and grounded ONLY in the issues given — invent no specifics (colours, ratios, " +
  "sizes) you weren't given.\n" +
  "Return ONLY the prompt text (markdown allowed), nothing else.";

const SYSTEM_PROMPT_CMS =
  "You write numbered, platform-specific STEPS a non-technical site owner follows in their website " +
  "builder's editor to fix every listed accessibility issue. You are given the platform name (e.g. " +
  "Wix, WordPress, Webflow, Squarespace), the site name, and issues grouped by page then rule; each " +
  "issue has a plain-language description and a fix.\n" +
  "WRITE THE STEPS SO THAT:\n" +
  "- They use the ACTUAL menus, panels, and click-paths of THAT platform (e.g. for Wix: the Editor, " +
  "the element's Settings panel, \"Alt Text\"; for WordPress: the block editor / theme settings).\n" +
  "- They refer to each element by its VISIBLE TEXT or PURPOSE, never a CSS selector or rule id.\n" +
  "- They are organised by page, then numbered, so the owner can work through them in order.\n" +
  "- They are concrete and grounded ONLY in the issues given — invent no specifics you weren't given.\n" +
  "Return ONLY the instructions (markdown allowed), nothing else.";

/** The model payload: platform + site + the grouped, capped issues (selectors stripped — the AI must
 *  not echo them). Compact JSON so the model gets structure without selector noise. */
function buildPayload(
  pages: PageGroup[],
  platform: Platform,
  siteName: string,
): string {
  return JSON.stringify({
    platform: PLATFORM_LABELS[platform],
    siteName,
    pages: pages.map((p) => ({
      page: p.path,
      rules: p.rules.map((r) => ({
        rule: r.ruleId,
        wcag: r.wcag,
        impact: r.impact,
        issues: r.issues.map((i) => ({
          what: i.what,
          fix: i.fix,
          ...(i.after ? { correctedHtml: i.after } : {}),
        })),
      })),
    })),
  });
}

/**
 * The deterministic TEMPLATE document — assembled with NO model call. Used as the fallback whenever
 * the AI tier is unconfigured or the GLM call throws, so the function is total. Clean, readable
 * markdown the unit test asserts on: it always names the site, branches on AI-builder vs CMS, and
 * lists every prepared issue grouped by page → rule.
 */
function templatePrompt(pages: PageGroup[], platform: Platform, siteName: string): string {
  const label = PLATFORM_LABELS[platform];
  const lines: string[] = [];

  if (isAiBuilder(platform)) {
    lines.push(
      `Fix the following accessibility issues on my ${label} site "${siteName}". ` +
        "For each item, locate the element by its description and apply the fix. " +
        "Where corrected HTML is given, use it exactly.",
    );
  } else {
    lines.push(`# Accessibility fixes for "${siteName}" (${label})`);
    lines.push("");
    lines.push(
      `Work through these in your ${label} editor. Each item names the element to find and what to change.`,
    );
  }
  lines.push("");

  for (const page of pages) {
    lines.push(`## ${page.path}`);
    lines.push("");
    let n = 1;
    for (const rule of page.rules) {
      for (const issue of rule.issues) {
        lines.push(`${n}. ${issue.what}`);
        lines.push(`   - Fix: ${issue.fix}`);
        if (rule.wcag.length) lines.push(`   - WCAG: ${rule.wcag.join(", ")}`);
        if (issue.after) {
          lines.push("   - Use this markup:");
          lines.push("");
          lines.push("     ```html");
          lines.push(`     ${issue.after}`);
          lines.push("     ```");
        }
        lines.push("");
        n += 1;
      }
    }
  }

  // Always end on a friendly, valid line even when there's nothing to do.
  if (pages.length === 0) {
    lines.push("No accessibility issues were found to fix. Nice work!");
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

/**
 * Build the single paste-ready remediation message for a scan's findings, tailored to the owner's
 * platform. Dedupes + caps (worst-first) + groups the issues, then makes ONE batched GLM call with a
 * platform-appropriate, precision-biased system prompt. Falls back to a deterministic template
 * (`source: "template"`) — with no model call — when the AI tier is unconfigured or the call fails.
 *
 * NEVER throws: every failure path resolves to the template document, so a route can call this
 * directly without `Promise.allSettled` safety.
 */
export async function buildBuilderPrompt(
  issues: BuilderPromptIssue[],
  opts: { platform: string; siteName: string },
): Promise<BuilderPromptResult> {
  const platform = resolvePlatform(opts.platform);
  const siteName = opts.siteName.trim() || "your site";
  const { pages, count } = prepare(issues);

  // No model available (or nothing to do) → deterministic template, no network.
  if (!aiConfigured()) {
    return {
      platform: opts.platform,
      prompt: templatePrompt(pages, platform, siteName),
      source: "template",
      issueCount: count,
    };
  }

  try {
    const system = isAiBuilder(platform) ? SYSTEM_PROMPT_AI_BUILDER : SYSTEM_PROMPT_CMS;
    const prompt = await glmAsk([{ type: "text", text: buildPayload(pages, platform, siteName) }], {
      system,
      maxTokens: 4000,
    });
    // Empty/blank model output is a miss — fall back rather than return a useless document.
    if (!prompt.trim()) throw new Error("empty model response");
    return { platform: opts.platform, prompt: prompt.trim(), source: "ai", issueCount: count };
  } catch (e) {
    console.error("builder prompt failed:", e);
    return {
      platform: opts.platform,
      prompt: templatePrompt(pages, platform, siteName),
      source: "template",
      issueCount: count,
    };
  }
}
