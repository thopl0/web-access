import type { Page } from "playwright";
import type { Finding } from "@web-access/shared";
import { runAxe } from "./axe.js";
import { runGeometry } from "./geometry.js";
import { runContrast } from "./contrast.js";

export { mapAxeViolations, extractWcag, runAxe } from "./axe.js";
export { detectPositiveTabindex, detectReadingOrderInversions, runGeometry } from "./geometry.js";
export { runContrast } from "./contrast.js";
export * from "./color.js";

/**
 * Run all analyzers for the current build sequence against a rendered page.
 *
 * v1 "automatic layer": Tier 1 (axe) + Tier 2 (reading/focus-order geometry, contrast over
 * image/gradient). The Tier-3 AI gate is a later phase. Each pass is independent; failures in one
 * don't sink the others.
 */
export async function runAnalysis(page: Page): Promise<Finding[]> {
  const passes = await Promise.allSettled([runAxe(page), runGeometry(page), runContrast(page)]);
  const findings: Finding[] = [];
  for (const p of passes) {
    if (p.status === "fulfilled") findings.push(...p.value);
    else console.error("analyzer pass failed:", p.reason);
  }
  return findings;
}
