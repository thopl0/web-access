import type { Page } from "playwright";
import type { Finding } from "@web-access/shared";
import { runAxe } from "./axe";
import { runGeometry } from "./geometry";
import { runContrast } from "./contrast";
import { runAltTextJudge } from "./ai/altText";
import { runVisionJudge } from "./ai/visionJudge";
import { runLinkPurposeJudge } from "./ai/linkPurpose";
import { runHeadingQualityJudge } from "./ai/headingQuality";
import { runPageTitleJudge } from "./ai/pageTitle";
import { runFormErrorJudge } from "./ai/formErrors";
import { runColorOnlyJudge } from "./ai/colorOnly";
import { runRepeatedLinksJudge } from "./ai/repeatedLinks";

export { mapAxeViolations, extractWcag, runAxe } from "./axe";
export { detectPositiveTabindex, detectReadingOrderInversions, runGeometry } from "./geometry";
export { runContrast } from "./contrast";
export * from "./color";
export { aiConfigured, glmAsk, glmConfig } from "./ai/glm";
export { gemmaConfigured, gemmaAsk, gemmaConfig } from "./ai/gemma";
export { runAltTextJudge, collectImages } from "./ai/altText";
export { runVisionJudge } from "./ai/visionJudge";
export { runLinkPurposeJudge, collectLinks } from "./ai/linkPurpose";
export { runHeadingQualityJudge, collectHeadings } from "./ai/headingQuality";
export { runPageTitleJudge, collectPageTitle } from "./ai/pageTitle";
export { runFormErrorJudge, collectFormErrors } from "./ai/formErrors";
export { runColorOnlyJudge, collectColorRefs } from "./ai/colorOnly";
export { runRepeatedLinksJudge, collectRepeatedLinkGroups } from "./ai/repeatedLinks";
export { enrichFindings, type FindingExplanation } from "./ai/enrich";
export {
  generateReportSummary,
  type ReportSummary,
  type TriageItem,
} from "./ai/reportSummary";
export { suggestFix, suggestFixes, deterministicFix, aiFixes } from "./fix";
export {
  buildBuilderPrompt,
  type BuilderPromptIssue,
  type BuilderPromptResult,
} from "./fix";

/**
 * Run all analyzers for the current build sequence against a rendered page.
 *
 * Tier 1 (axe) + Tier 2 (reading/focus-order geometry, contrast over image/gradient) form the
 * "automatic layer". Tier 3 is the AI judge. The GLM text judges reason over DOM text the model can
 * see — alt-text quality (`runAltTextJudge`), link purpose in context (`runLinkPurposeJudge`),
 * heading descriptiveness (`runHeadingQualityJudge`), page-title quality (`runPageTitleJudge`), form
 * error clarity (`runFormErrorJudge`), colour-only cues (`runColorOnlyJudge`), and ambiguous repeated
 * links (`runRepeatedLinksJudge`) — and the vision pass (`runVisionJudge`, Gemma) judges the two
 * checks that need pixels (alt-text fidelity + decorative misclassification). Each AI pass
 * independently no-ops unless ITS provider is configured, so the deterministic tiers run standalone
 * and either AI provider can be enabled alone. Each pass is independent; failures in one don't sink
 * the others.
 *
 * `opts.ai` (default true) gates the Tier-3 judges: the worker passes `false` for sites whose owner's
 * plan doesn't include AI, so the deterministic tiers still run on every plan.
 */
export async function runAnalysis(page: Page, opts: { ai?: boolean } = {}): Promise<Finding[]> {
  const ai = opts.ai ?? true;
  const passes = await Promise.allSettled([
    runAxe(page),
    runGeometry(page),
    runContrast(page),
    ...(ai
      ? [
          runAltTextJudge(page),
          runVisionJudge(page),
          runLinkPurposeJudge(page),
          runHeadingQualityJudge(page),
          runPageTitleJudge(page),
          runFormErrorJudge(page),
          runColorOnlyJudge(page),
          runRepeatedLinksJudge(page),
        ]
      : []),
  ]);
  const findings: Finding[] = [];
  for (const p of passes) {
    if (p.status === "fulfilled") findings.push(...p.value);
    else console.error("analyzer pass failed:", p.reason);
  }
  return findings;
}
