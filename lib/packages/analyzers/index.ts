import type { Page } from "playwright";
import type { Finding } from "@web-access/shared";
import { runAxe } from "./axe";
import { runGeometry } from "./geometry";
import { runContrast } from "./contrast";
import { runAltTextJudge } from "./ai/altText";

export { mapAxeViolations, extractWcag, runAxe } from "./axe";
export { detectPositiveTabindex, detectReadingOrderInversions, runGeometry } from "./geometry";
export { runContrast } from "./contrast";
export * from "./color";
export { aiConfigured, glmAsk, glmConfig } from "./ai/glm";
export { runAltTextJudge, collectImages } from "./ai/altText";
export { enrichFindings, type FindingExplanation } from "./ai/enrich";

/**
 * Run all analyzers for the current build sequence against a rendered page.
 *
 * Tier 1 (axe) + Tier 2 (reading/focus-order geometry, contrast over image/gradient) form the
 * "automatic layer". Tier 3 is the AI judge (alt-text fidelity / decorative misclassification) — it
 * no-ops unless a GLM key is configured, so the deterministic tiers run standalone. Each pass is
 * independent; failures in one don't sink the others.
 */
export async function runAnalysis(page: Page): Promise<Finding[]> {
  const passes = await Promise.allSettled([
    runAxe(page),
    runGeometry(page),
    runContrast(page),
    runAltTextJudge(page),
  ]);
  const findings: Finding[] = [];
  for (const p of passes) {
    if (p.status === "fulfilled") findings.push(...p.value);
    else console.error("analyzer pass failed:", p.reason);
  }
  return findings;
}
