/**
 * Shared types for the Tier-3 AI eval harness (plan §6 / §8.4: "build eval corpus + harness FIRST").
 *
 * The harness is deliberately judge-agnostic: a "judge" is anything that maps a labeled input to a
 * single predicted label, and the corpus is a list of `(input, gold)` pairs. That lets the SAME
 * metrics + report code grade the text judge (GLM, alt-text quality) and, later, the vision judge
 * (Gemma, alt fidelity + decorative) without change.
 *
 * Labels are rule ids (e.g. "alt-text-filename") plus the sentinel NEGATIVE label `"ok"`, which means
 * "no problem / not confident enough to flag". Until the confidence/abstention gate lands (plan §4,
 * the NEXT phase-2 step) abstention is folded into `"ok"`, so `"ok"` doubles as both "clean" and
 * "abstained" — `Metrics.predictedNegativeRate` tracks how often the judge stayed silent.
 */

/** The negative / no-finding label. A judge predicts this when it sees no defensible problem. */
export const OK = "ok" as const;

/** A predicted or gold label: a rule id, or {@link OK}. */
export type Label = string;

/**
 * One graded corpus item. `input` is whatever the judge under test consumes (an `ImageCandidate` for
 * the text judge); the harness never inspects it, it just hands it to the judge. `gold` is the
 * human-assigned correct label. `notes` records WHY that gold label is defensible — every label is a
 * judgment call, so the rationale travels with the data (it's also what a second labeler reviews).
 */
export interface EvalCase<Input> {
  /** Stable id, unique within a corpus — used in the per-case report and to diff runs. */
  id: string;
  /** Coarse page context this case represents (marketing, ecommerce, blog, docs, app-ui …) so we can
   *  see whether accuracy holds across the contexts the plan calls out, not just in aggregate. */
  context: string;
  input: Input;
  /** The correct label: a rule id, or {@link OK}. */
  gold: Label;
  /** One line on why `gold` is the defensible answer (the labeler's rationale). */
  notes: string;
}

/** A judge's prediction for one case, paired back with its gold for scoring. */
export interface Prediction {
  id: string;
  context: string;
  gold: Label;
  predicted: Label;
  /** True when the judge call itself threw (timeout / bad JSON / outage). Counted separately so a
   *  flaky model run isn't silently scored as a wrong answer. */
  errored: boolean;
}

/** Precision / recall / F1 for a single non-negative class. */
export interface ClassMetrics {
  label: Label;
  /** Gold cases with this label (the denominator for recall). */
  support: number;
  /** Cases the judge predicted this label (the denominator for precision). */
  predicted: number;
  /** Predicted this label AND gold matches. */
  truePositives: number;
  precision: number;
  recall: number;
  f1: number;
}

/** The full scorecard for one eval run over one corpus. */
export interface Metrics {
  total: number;
  /** Cases dropped from scoring because the judge call errored (see {@link Prediction.errored}). */
  errors: number;
  /** Cases actually scored (`total - errors`). All rates below are over this. */
  scored: number;
  /** BINARY problem-vs-ok view (the headline numbers the plan sets targets for): precision ≥ 0.85,
   *  recall ≥ 0.70. "Positive" = any non-`ok` label, "negative" = `ok`. */
  detection: { precision: number; recall: number; f1: number };
  /** Of gold-`ok` cases, the fraction correctly left alone — i.e. how rarely we cry wolf on good
   *  markup. The complement is the user-facing false-positive rate. */
  okSpecificity: number;
  /** Fraction of ALL scored cases the judge labeled `ok`. A proxy for abstention rate until a
   *  first-class `abstain` exists (plan §4); rising sharply across runs flags a judge gone silent. */
  predictedNegativeRate: number;
  /** Per non-`ok` class breakdown, sorted by label. */
  classes: ClassMetrics[];
  /** Confusion counts keyed `"gold→predicted"`, for the report's matrix. */
  confusion: Record<string, number>;
}

/** Pass/fail thresholds applied to {@link Metrics.detection} (plan §6). */
export interface EvalThresholds {
  minPrecision: number;
  minRecall: number;
}

/** Plan §6 targets: precision-biased (≥0.85), recall to ~0.70 (chasing past the human ceiling chases
 *  label noise). The live guard fails a run that drops below these. */
export const DEFAULT_THRESHOLDS: EvalThresholds = { minPrecision: 0.85, minRecall: 0.7 };
