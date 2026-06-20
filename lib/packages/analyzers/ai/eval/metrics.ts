/**
 * Pure scoring for the AI eval harness — no models, no I/O, fully deterministic, so it's the part the
 * always-on regression-guard test pins (see `metrics.test.ts`). Given the gold/predicted label pairs
 * a run produced, it computes per-class precision/recall/F1, the binary detection numbers the plan
 * sets targets for, the confusion matrix, and an abstention proxy.
 *
 * Multi-class with a designated NEGATIVE label (`ok`): every other label is a distinct "problem"
 * class. "Detection" collapses all problem classes into one positive class vs `ok` — that's the view
 * the plan's precision ≥ 0.85 / recall ≥ 0.70 targets are about (did we flag a real problem, and were
 * our flags right), independent of whether we picked the exact sub-type.
 */
import { OK, type ClassMetrics, type Metrics, type Prediction } from "./types";

/** precision = TP / (TP + FP); 0 when nothing was predicted (no flags ⇒ vacuously precise is misleading,
 *  so we report 1 only when there were also no positives to find — handled by the caller's context). */
function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function f1(precision: number, recall: number): number {
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

/**
 * Score a set of predictions. `errored` predictions are excluded from every rate (a model outage is
 * not a wrong answer) but counted in {@link Metrics.errors} so they can't hide.
 */
export function score(predictions: Prediction[], negative: string = OK): Metrics {
  const total = predictions.length;
  const scored = predictions.filter((p) => !p.errored);
  const errors = total - scored.length;

  // Distinct non-negative labels seen as either gold or prediction → the problem classes to break out.
  const labels = new Set<string>();
  for (const p of scored) {
    if (p.gold !== negative) labels.add(p.gold);
    if (p.predicted !== negative) labels.add(p.predicted);
  }

  const classes: ClassMetrics[] = [...labels].sort().map((label) => {
    const support = scored.filter((p) => p.gold === label).length;
    const predicted = scored.filter((p) => p.predicted === label).length;
    const truePositives = scored.filter((p) => p.gold === label && p.predicted === label).length;
    const precision = ratio(truePositives, predicted);
    const recall = ratio(truePositives, support);
    return { label, support, predicted, truePositives, precision, recall, f1: f1(precision, recall) };
  });

  // Binary detection: positive = any non-negative label.
  const isPos = (l: string) => l !== negative;
  const detTP = scored.filter((p) => isPos(p.gold) && isPos(p.predicted)).length;
  const detFP = scored.filter((p) => !isPos(p.gold) && isPos(p.predicted)).length;
  const detFN = scored.filter((p) => isPos(p.gold) && !isPos(p.predicted)).length;
  const detPrecision = ratio(detTP, detTP + detFP);
  const detRecall = ratio(detTP, detTP + detFN);

  const goldNeg = scored.filter((p) => !isPos(p.gold));
  const okSpecificity = ratio(
    goldNeg.filter((p) => !isPos(p.predicted)).length,
    goldNeg.length,
  );
  const predictedNegativeRate = ratio(scored.filter((p) => !isPos(p.predicted)).length, scored.length);

  const confusion: Record<string, number> = {};
  for (const p of scored) {
    const key = `${p.gold}→${p.predicted}`;
    confusion[key] = (confusion[key] ?? 0) + 1;
  }

  return {
    total,
    errors,
    scored: scored.length,
    detection: { precision: detPrecision, recall: detRecall, f1: f1(detPrecision, detRecall) },
    okSpecificity,
    predictedNegativeRate,
    classes,
    confusion,
  };
}
