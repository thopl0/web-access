/**
 * AI eval harness (plan §6 / §8.4). Public surface: the corpus, the runner, the scorer, the report,
 * and the thresholds. The judge ADAPTERS below turn a production judge (which returns a `Finding |
 * null`) into the harness's `Judge<Input>` shape (which returns a label), so the corpus grades the
 * exact code the scan runs.
 */
import type { Finding } from "@web-access/shared";
import { judgeAltText, type ImageCandidate } from "../altText";
import { OK, type Label } from "./types";
import type { Judge } from "./harness";

export * from "./types";
export * from "./metrics";
export * from "./harness";
export { ALT_TEXT_CORPUS } from "./corpus/altText";

/** A finding's rule id is its label; `null` (no problem / abstain) maps to {@link OK}. */
function labelOf(finding: Finding | null): Label {
  return finding?.ruleId ?? OK;
}

/** The text alt-text-quality judge, as a harness judge. Calls the real `judgeAltText` (GLM). */
export const altTextJudge: Judge<ImageCandidate> = async (input) => labelOf(await judgeAltText(input));
