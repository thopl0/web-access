/**
 * AI eval harness (plan §6 / §8.4). Public surface: the corpus, the runner, the scorer, the report,
 * and the thresholds. The judge ADAPTERS below turn a production judge (which returns a `Finding |
 * null`) into the harness's `Judge<Input>` shape (which returns a label), so the corpus grades the
 * exact code the scan runs.
 */
import type { Finding } from "@web-access/shared";
import { judgeAltText, type ImageCandidate } from "../altText";
import { judgeLinkPurpose, type LinkPurposeCandidate } from "../linkPurpose";
import { judgeHeadingQuality, type HeadingQualityCandidate } from "../headingQuality";
import { judgePageTitle, type PageTitleCandidate } from "../pageTitle";
import { judgeFormError, type FormErrorCandidate } from "../formErrors";
import { judgeColorOnly, type ColorOnlyCandidate } from "../colorOnly";
import { judgeRepeatedLinks, type RepeatedLinkGroup } from "../repeatedLinks";
import { OK, type Label } from "./types";
import type { Judge } from "./harness";

export * from "./types";
export * from "./metrics";
export * from "./harness";
export { ALT_TEXT_CORPUS } from "./corpus/altText";
export { LINK_PURPOSE_CORPUS } from "./corpus/linkPurpose";
export { HEADING_QUALITY_CORPUS } from "./corpus/headingQuality";
export { PAGE_TITLE_CORPUS } from "./corpus/pageTitle";
export { FORM_ERROR_CORPUS } from "./corpus/formErrors";
export { COLOR_ONLY_CORPUS } from "./corpus/colorOnly";
export { REPEATED_LINKS_CORPUS } from "./corpus/repeatedLinks";

/** A finding's rule id is its label; `null` (no problem / abstain) maps to {@link OK}. */
function labelOf(finding: Finding | null): Label {
  return finding?.ruleId ?? OK;
}

// Each adapter wraps the REAL production judge (the same `judge*` the scan calls), so the corpus
// grades the exact code path — not a drifting copy of the prompt. The judge is page-free by contract,
// so the harness can drive it directly with corpus inputs (no Playwright Page needed).

/** The text alt-text-quality judge, as a harness judge. Calls the real `judgeAltText` (GLM). */
export const altTextJudge: Judge<ImageCandidate> = async (input) => labelOf(await judgeAltText(input));
/** Link purpose in context (WCAG 2.4.4). */
export const linkPurposeJudge: Judge<LinkPurposeCandidate> = async (input) =>
  labelOf(await judgeLinkPurpose(input));
/** Heading descriptiveness (WCAG 2.4.6 / 1.3.1). */
export const headingQualityJudge: Judge<HeadingQualityCandidate> = async (input) =>
  labelOf(await judgeHeadingQuality(input));
/** Page <title> quality (WCAG 2.4.2). */
export const pageTitleJudge: Judge<PageTitleCandidate> = async (input) =>
  labelOf(await judgePageTitle(input));
/** Form error & instruction clarity (WCAG 3.3.1 / 3.3.3). */
export const formErrorJudge: Judge<FormErrorCandidate> = async (input) =>
  labelOf(await judgeFormError(input));
/** Colour-only information cues (WCAG 1.4.1). */
export const colorOnlyJudge: Judge<ColorOnlyCandidate> = async (input) =>
  labelOf(await judgeColorOnly(input));
/** Ambiguous repeated links (WCAG 2.4.4). */
export const repeatedLinksJudge: Judge<RepeatedLinkGroup> = async (input) =>
  labelOf(await judgeRepeatedLinks(input));
