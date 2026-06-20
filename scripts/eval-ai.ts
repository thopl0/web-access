/**
 * Live AI-eval runner — `pnpm eval` (tsx). Runs each labeled corpus through its REAL judge (real
 * prompt, real model call) and prints a scorecard per check. This is the regression guard the plan
 * (§6/§8.4) says to re-run on EVERY prompt/model change: any check that drops below the
 * precision/recall targets makes the whole run exit non-zero, so it can gate a release.
 *
 * Needs the judge's provider configured (GLM for the text judges); with no key it can't measure
 * anything, so it exits 1 with guidance rather than pretending to pass. Costs real API calls — it is
 * intentionally NOT part of `pnpm test` (that runs the deterministic scorer guard, `metrics.test.ts`).
 * GLM is the flat-rate coding-plan key, so these text-judge evals are effectively free to run.
 *
 * Usage:
 *   pnpm eval                 # every GLM text judge over its corpus
 *   pnpm eval --json          # also dump raw predictions as JSON
 *   pnpm eval link-purpose    # filter to checks whose name contains the argument(s)
 */
import { config } from "dotenv";
import {
  ALT_TEXT_CORPUS,
  COLOR_ONLY_CORPUS,
  DEFAULT_THRESHOLDS,
  FORM_ERROR_CORPUS,
  HEADING_QUALITY_CORPUS,
  LINK_PURPOSE_CORPUS,
  PAGE_TITLE_CORPUS,
  REPEATED_LINKS_CORPUS,
  altTextJudge,
  colorOnlyJudge,
  formErrorJudge,
  headingQualityJudge,
  linkPurposeJudge,
  pageTitleJudge,
  repeatedLinksJudge,
  formatReport,
  runEval,
  type Metrics,
  type Prediction,
} from "../lib/packages/analyzers/ai/eval";
import { aiConfigured } from "../lib/packages/analyzers/ai/glm";

config(); // load .env (cwd = repo root), same as the worker

/**
 * One eval target. `run` closes over a corpus + its matching judge so each entry stays type-safe even
 * though the corpora have different input types (an `ImageCandidate` vs a `RepeatedLinkGroup`); the
 * registry itself only sees the erased `() => Promise<{predictions, metrics}>` shape.
 */
interface EvalTarget {
  name: string;
  run: () => Promise<{ predictions: Prediction[]; metrics: Metrics }>;
}

function target<Input>(
  name: string,
  corpus: Parameters<typeof runEval<Input>>[0],
  judge: Parameters<typeof runEval<Input>>[1],
): EvalTarget {
  return { name, run: () => runEval(corpus, judge, { concurrency: 4 }) };
}

const TARGETS: EvalTarget[] = [
  target("alt-text", ALT_TEXT_CORPUS, altTextJudge),
  target("link-purpose", LINK_PURPOSE_CORPUS, linkPurposeJudge),
  target("heading-quality", HEADING_QUALITY_CORPUS, headingQualityJudge),
  target("page-title", PAGE_TITLE_CORPUS, pageTitleJudge),
  target("form-error", FORM_ERROR_CORPUS, formErrorJudge),
  target("color-only", COLOR_ONLY_CORPUS, colorOnlyJudge),
  target("repeated-links", REPEATED_LINKS_CORPUS, repeatedLinksJudge),
];

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const json = process.argv.includes("--json");

  if (!aiConfigured()) {
    console.error(
      "GLM is not configured — set GLM_API_KEY (see .env.example) to run the live text-judge eval.",
    );
    process.exit(1);
  }

  // Optional positional filter: only run checks whose name contains one of the given substrings.
  const targets = args.length
    ? TARGETS.filter((t) => args.some((a) => t.name.includes(a)))
    : TARGETS;
  if (targets.length === 0) {
    console.error(`No eval checks match ${JSON.stringify(args)}. Known: ${TARGETS.map((t) => t.name).join(", ")}`);
    process.exit(1);
  }

  const { minPrecision, minRecall } = DEFAULT_THRESHOLDS;
  const summary: { name: string; precision: number; recall: number; pass: boolean }[] = [];

  for (const t of targets) {
    const { predictions, metrics } = await t.run();
    console.log(formatReport(metrics, predictions, `${t.name} judge`));
    if (json) console.log("\n" + JSON.stringify({ check: t.name, metrics, predictions }, null, 2));

    const p = metrics.detection.precision;
    const r = metrics.detection.recall;
    summary.push({ name: t.name, precision: p, recall: r, pass: p >= minPrecision && r >= minRecall });
    console.log("");
  }

  // One combined gate: every check must clear the thresholds or the run fails (and can block a release).
  console.log(`=== Summary (threshold: precision ≥ ${minPrecision} & recall ≥ ${minRecall}) ===`);
  for (const s of summary) {
    console.log(
      `  ${s.name.padEnd(16)} precision ${s.precision.toFixed(2)}  recall ${s.recall.toFixed(2)}  ` +
        `→ ${s.pass ? "PASS" : "FAIL"}`,
    );
  }
  const allPass = summary.every((s) => s.pass);
  console.log(`\nOverall: ${allPass ? "PASS" : "FAIL"}`);
  if (!allPass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
