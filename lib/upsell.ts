/**
 * Teaser math for the anonymous public scan page — turns the FREE deterministic findings into
 * "here's what signing up would unlock" counts WITHOUT running (or implying we ran) any AI.
 *
 * Pure and dependency-light, in the same spirit as lib/legalRisk.ts: no I/O, no model calls, just
 * counting the findings we already computed for free, so every locked CTA shows a real, honest number.
 * Anonymous scans run the deterministic-only "Free" tier (see lib/server/entitlements.ts), so there is
 * never AI output to show here — these counts are how we make the premium tiers tangible at zero cost.
 */
import { rankByLegalRisk } from "@/lib/legalRisk";
import type { PageReport } from "@/lib/server/report";

/**
 * Rules whose correct fix is a judgment call about CONTENT (alt-text wording, ambiguous link text,
 * reworded headings/titles/errors) — the exact set the Tier-3 AI fix generator rewrites into a
 * paste-ready before→after. MIRRORED from `JUDGMENT_RULES` in packages/analyzers/fix/ai.ts (kept inline
 * so this module stays client-safe and free of the heavy analyzers package); keep the two in sync.
 */
const AI_FIX_RULES = new Set([
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

/** Image findings a vision pass (Gemma) would inspect — alt fidelity + decorative misclassification. */
const IMAGE_RULES = new Set([
  "image-alt",
  "input-image-alt",
  "area-alt",
  "role-img-alt",
  "svg-img-alt",
  "object-alt",
]);

export type UpsellTeasers = {
  /** Distinct issues found (deterministic). The denominator for the legal-risk hook. */
  totalIssues: number;
  /** Distinct findings whose legal-risk tier is "high" — the punchy "top legal risk" number. */
  topLegalRiskCount: number;
  /** Distinct findings the AI fix generator would write a paste-ready before→after for. */
  aiFixCount: number;
  /** Distinct image findings a vision pass would inspect. */
  visionImageCount: number;
};

/**
 * Derive the locked-feature counts from already-loaded deterministic pages. De-dupes by (rule +
 * element) across the whole site — exactly like `siteStartHere` — so a repeated issue counts once.
 */
export function upsellTeasers(pages: PageReport[]): UpsellTeasers {
  const seen = new Set<string>();
  const items: { ruleId: string; wcag: string[]; impact: string | null }[] = [];
  let aiFixCount = 0;
  let visionImageCount = 0;

  for (const page of pages) {
    for (const g of page.groups) {
      for (const el of g.elements) {
        const key = `${g.ruleId}\n${el.selector}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({ ruleId: g.ruleId, wcag: g.wcag, impact: g.impact });
        if (AI_FIX_RULES.has(g.ruleId)) aiFixCount += 1;
        if (IMAGE_RULES.has(g.ruleId)) visionImageCount += 1;
      }
    }
  }

  const topLegalRiskCount = rankByLegalRisk(items).filter((r) => r.risk.tier === "high").length;

  return { totalIssues: items.length, topLegalRiskCount, aiFixCount, visionImageCount };
}
