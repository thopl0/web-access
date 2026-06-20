/**
 * Live AI-eval runner — `pnpm eval` (tsx). Runs the labeled corpus through the REAL judge (real
 * prompt, real model call) and prints the scorecard. This is the regression guard the plan (§6/§8.4)
 * says to re-run on EVERY prompt/model change: a run that drops below the precision/recall targets
 * exits non-zero, so it can gate a release.
 *
 * Needs the judge's provider configured (GLM for the text judge); with no key it can't measure
 * anything, so it exits 1 with guidance rather than pretending to pass. Costs real API calls — it is
 * intentionally NOT part of `pnpm test` (that runs the deterministic scorer guard, `metrics.test.ts`).
 *
 * Usage:
 *   pnpm eval                 # text alt-text judge (default)
 *   pnpm eval --json          # also dump raw predictions as JSON
 */
import { config } from "dotenv";
import {
  ALT_TEXT_CORPUS,
  altTextJudge,
  DEFAULT_THRESHOLDS,
  formatReport,
  runEval,
} from "../lib/packages/analyzers/ai/eval";
import { aiConfigured } from "../lib/packages/analyzers/ai/glm";

config(); // load .env (cwd = repo root), same as the worker

async function main(): Promise<void> {
  const json = process.argv.includes("--json");

  if (!aiConfigured()) {
    console.error(
      "GLM is not configured — set GLM_API_KEY (see .env.example) to run the live text-judge eval.",
    );
    process.exit(1);
  }

  console.error(`Running ${ALT_TEXT_CORPUS.length} cases through the text alt-text judge…\n`);
  const { predictions, metrics } = await runEval(ALT_TEXT_CORPUS, altTextJudge, { concurrency: 4 });

  console.log(formatReport(metrics, predictions, "Text alt-text judge"));
  if (json) console.log("\n" + JSON.stringify({ metrics, predictions }, null, 2));

  const { minPrecision, minRecall } = DEFAULT_THRESHOLDS;
  const p = metrics.detection.precision;
  const r = metrics.detection.recall;
  const pass = p >= minPrecision && r >= minRecall;
  console.log(
    `\nThreshold: precision ≥ ${minPrecision} & recall ≥ ${minRecall} → ` +
      `${pass ? "PASS" : "FAIL"} (precision ${p.toFixed(2)}, recall ${r.toFixed(2)})`,
  );
  if (!pass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
