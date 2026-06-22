import AxeBuilder from "@axe-core/playwright";
import type { Page } from "playwright";
import type { Result as AxeResult } from "axe-core";
import type { CssPatch, Finding, Impact } from "@web-access/shared";

/**
 * EXPERIMENTAL CSS fix for the visual rules we can fix mechanically:
 *   - target-size: give the control a minimum 24×24 hit area (WCAG 2.5.8 AA), as inline-block so the
 *     min size actually takes effect.
 * Returns undefined when we don't have the data to compute a safe fix.
 *
 * color-contrast is DELIBERATELY excluded: a static `color` override can't be applied safely from a
 * scan. It ignores the element's `opacity`, fires on decorative / `aria-hidden` / near-invisible text
 * (e.g. `text-white/[0.06]` watermarks) that shouldn't be contrast-checked, and trusts axe's measured
 * background — which is wrong on themed/dark sites. Applied with `!important`, it turned intended
 * decoration into visible LOW-contrast text, i.e. it CREATED the failures it claimed to fix (verified:
 * Lighthouse flagged our patched elements; turning the patches off cleared them). Contrast stays a
 * read-only suggestion in the report, never a live patch, until we can verify a fix against the
 * rendered page (opacity + actual background).
 */
function cssFixFor(ruleId: string): CssPatch[] | undefined {
  if (ruleId === "target-size") {
    return [
      { prop: "min-width", value: "24px" },
      { prop: "min-height", value: "24px" },
      { prop: "display", value: "inline-block" },
    ];
  }
  return undefined;
}

/** WCAG A/AA tags we ask axe to evaluate (2.0 / 2.1 / 2.2). */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** Max length of the stored HTML snippet — we keep evidence small (plan: results-only). */
const SNIPPET_MAX = 300;

function truncate(s: string, max = SNIPPET_MAX): string {
  const trimmed = s.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

/**
 * Render an axe `target` into a readable location string. axe encodes two kinds of nesting:
 *   - the TOP-LEVEL array is a FRAME path — one entry per `<iframe>` level, the last being the
 *     element inside the deepest frame. Length 1 means the element is in the main document.
 *   - any entry may itself be a `string[]`, a shadow-DOM path within that frame/document.
 * Flattening both with a plain space (the old behaviour) produced an INVALID same-document selector
 * for in-iframe findings (e.g. `#frame button` — which doesn't exist in the top document). We join
 * shadow steps with a space but frame levels with ` >> ` so the boundary is explicit and honest.
 */
function selectorToString(target: unknown): string {
  if (!Array.isArray(target)) return target == null ? "" : String(target);
  return target
    .map((level) => (Array.isArray(level) ? level.map((s) => String(s)).join(" ") : String(level)))
    .join(" >> ");
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
      const cssFix = cssFixFor(v.id);
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
        ...(cssFix ? { cssFix } : {}),
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
