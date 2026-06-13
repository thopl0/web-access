import AxeBuilder from "@axe-core/playwright";
import type { Page } from "playwright";
import type { Result as AxeResult } from "axe-core";
import type { Finding, Impact } from "@web-access/shared";

/** WCAG A/AA tags we ask axe to evaluate (2.0 / 2.1 / 2.2). */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** Max length of the stored HTML snippet — we keep evidence small (plan: results-only). */
const SNIPPET_MAX = 300;

function truncate(s: string, max = SNIPPET_MAX): string {
  const trimmed = s.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

/** axe target entries can be nested arrays (shadow DOM); flatten to a single selector string. */
function selectorToString(target: unknown): string {
  if (Array.isArray(target)) return target.map(selectorToString).join(" ");
  return String(target);
}

/** Convert axe tags like "wcag111" / "wcag1412" into SC numbers like "1.1.1" / "1.4.12". */
export function extractWcag(tags: string[]): string[] {
  const out: string[] = [];
  for (const t of tags) {
    const m = /^wcag(\d)(\d)(\d{1,2})$/.exec(t);
    if (m) out.push(`${m[1]}.${m[2]}.${Number(m[3])}`);
  }
  return [...new Set(out)];
}

/**
 * Pure mapping of axe violations to our normalized Finding schema. Kept side-effect-free so it can
 * be unit-tested without a browser (see axe.test.ts).
 */
export function mapAxeViolations(violations: AxeResult[]): Finding[] {
  const findings: Finding[] = [];
  for (const v of violations) {
    const wcag = extractWcag(v.tags);
    for (const node of v.nodes) {
      findings.push({
        ruleId: v.id,
        source: "axe",
        tier: 1,
        wcag,
        impact: (node.impact ?? v.impact ?? null) as Impact,
        selector: selectorToString(node.target),
        htmlSnippet: truncate(node.html),
        message: v.help,
        ...(v.helpUrl ? { helpUrl: v.helpUrl } : {}),
      });
    }
  }
  return findings;
}

/** Tier-1: run axe-core against an already-rendered Playwright page and return normalized findings. */
export async function runAxe(page: Page): Promise<Finding[]> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  return mapAxeViolations(results.violations);
}
