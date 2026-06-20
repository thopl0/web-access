/**
 * The eval runner: take a corpus and a judge, produce predictions + a {@link Metrics} scorecard, and
 * pretty-print it. Judge-agnostic by design (see `types.ts`) — `runEval` only needs a function from
 * `input` to a predicted {@link Label}, so the same harness grades the text judge today and the vision
 * judge later.
 *
 * Concurrency is bounded (each case is a paid model call) and a thrown judge call becomes an `errored`
 * prediction rather than sinking the run — mirroring how the analyzers themselves treat AI failures.
 */
import { OK, type EvalCase, type Label, type Metrics, type Prediction } from "./types";
import { score } from "./metrics";

/** Maps one corpus input to a single predicted label. Returning {@link OK} = "no problem / abstain". */
export type Judge<Input> = (input: Input) => Promise<Label>;

export interface RunOptions {
  /** Max in-flight judge calls. Low by default — these are billed API calls, not free CPU. */
  concurrency?: number;
}

/** Run `judge` over every case with bounded concurrency; never throws (errors become `errored` preds). */
export async function runEval<Input>(
  cases: EvalCase<Input>[],
  judge: Judge<Input>,
  opts: RunOptions = {},
): Promise<{ predictions: Prediction[]; metrics: Metrics }> {
  const concurrency = Math.max(1, opts.concurrency ?? 4);
  const predictions: Prediction[] = new Array(cases.length);

  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= cases.length) return;
      const c = cases[i];
      try {
        const predicted = await judge(c.input);
        predictions[i] = { id: c.id, context: c.context, gold: c.gold, predicted, errored: false };
      } catch {
        // A model timeout / bad-JSON / outage: record as errored (excluded from rates), not as a miss.
        predictions[i] = { id: c.id, context: c.context, gold: c.gold, predicted: OK, errored: true };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, cases.length) }, worker));

  return { predictions, metrics: score(predictions) };
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

/** Render a run as a plain-text report for the CLI / CI log. */
export function formatReport(metrics: Metrics, predictions: Prediction[], title = "AI eval"): string {
  const L: string[] = [];
  L.push(`=== ${title} ===`);
  L.push(`cases: ${metrics.total}  scored: ${metrics.scored}  errors: ${metrics.errors}`);
  L.push("");
  L.push("Detection (any problem vs ok):");
  L.push(`  precision ${pct(metrics.detection.precision)}   recall ${pct(metrics.detection.recall)}   f1 ${pct(metrics.detection.f1)}`);
  L.push(`  ok specificity ${pct(metrics.okSpecificity)}   predicted-ok rate ${pct(metrics.predictedNegativeRate)}`);
  L.push("");
  L.push("Per class:");
  if (metrics.classes.length === 0) L.push("  (no problem classes in corpus)");
  for (const c of metrics.classes) {
    L.push(
      `  ${c.label.padEnd(26)} P ${pct(c.precision).padStart(6)}  R ${pct(c.recall).padStart(6)}  ` +
        `F1 ${pct(c.f1).padStart(6)}  (tp ${c.truePositives}/pred ${c.predicted}/gold ${c.support})`,
    );
  }
  L.push("");

  // Surface mistakes — the whole point is to see WHAT regressed, not just that something did.
  const wrong = predictions.filter((p) => !p.errored && p.gold !== p.predicted);
  if (wrong.length) {
    L.push(`Misclassified (${wrong.length}):`);
    for (const p of wrong) L.push(`  [${p.context}] ${p.id}: gold=${p.gold}  predicted=${p.predicted}`);
    L.push("");
  }
  const errored = predictions.filter((p) => p.errored);
  if (errored.length) {
    L.push(`Errored (${errored.length}, excluded from scores):`);
    for (const p of errored) L.push(`  [${p.context}] ${p.id}`);
    L.push("");
  }
  return L.join("\n");
}
