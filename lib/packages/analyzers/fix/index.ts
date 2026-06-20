/**
 * Fix suggestion dispatcher: turn a Finding into a concrete `before→after` code fix (the product's
 * core differentiator). Two layers, tried in order:
 *   1. `deterministicFix` — a mechanical, templated transform for issues whose corrected markup is
 *      unambiguous (e.g. adding `lang="en"`). Synchronous, no model call.
 *   2. `aiFixes` — a GLM-derived suggestion for JUDGMENT issues (alt-text content, ambiguous link
 *      names) where the right markup needs reasoning over text context. Always `needsReview`.
 */
import type { Finding, FixSuggestion } from "@web-access/shared";
import { deterministicFix } from "./deterministic";
import { aiFixes } from "./ai";

export { FixKind, FixSuggestion } from "@web-access/shared";
export { deterministicFix } from "./deterministic";
export { aiFixes, aiFix } from "./ai";
export {
  buildBuilderPrompt,
  type BuilderPromptIssue,
  type BuilderPromptResult,
} from "./builderPrompt";

/**
 * Suggest a fix for a SINGLE finding: try the deterministic transform first; if it produces nothing,
 * fall back to one AI call. Returns null when neither layer applies.
 *
 * NOTE: this issues an AI call per invocation, so do NOT loop it over many findings — use
 * `suggestFixes` for batches (one GLM round-trip per scan).
 */
export async function suggestFix(
  finding: Finding,
  opts: { ai?: boolean } = {},
): Promise<FixSuggestion | null> {
  const det = deterministicFix(finding);
  if (det) {
    return {
      ruleId: finding.ruleId,
      kind: "deterministic",
      before: det.before,
      after: det.after,
      needsReview: det.needsReview,
      ...(det.note ? { note: det.note } : {}),
      ...(det.attributePatch ? { attributePatch: det.attributePatch } : {}),
    };
  }
  // The AI fallback is plan-gated: `opts.ai === false` keeps only the (free) deterministic layer.
  if (opts.ai === false) return null;
  return (await aiFixes([finding]))[0] ?? null;
}

/**
 * Batch helper (the worker's entry point): suggest a fix for each finding, aligned to the input
 * array (`null` where neither layer applies).
 *
 * DESIGN: run `deterministicFix` synchronously for every finding first, then make ONE batched
 * `aiFixes` call over ONLY the findings the deterministic layer couldn't handle, and merge those
 * results back into the right slots. This keeps a scan to a single GLM round-trip — calling
 * `suggestFix` in a loop would fire N independent AI calls, which we deliberately avoid.
 */
export async function suggestFixes(
  findings: Finding[],
  opts: { ai?: boolean } = {},
): Promise<(FixSuggestion | null)[]> {
  const out: (FixSuggestion | null)[] = findings.map(() => null);

  // Pass 1: deterministic fixes (sync). Collect the leftovers for the single AI batch.
  const aiInputs: Finding[] = [];
  const aiSlots: number[] = []; // original index for each entry in aiInputs
  findings.forEach((f, i) => {
    const det = deterministicFix(f);
    if (det) {
      out[i] = {
        ruleId: f.ruleId,
        kind: "deterministic",
        before: det.before,
        after: det.after,
        needsReview: det.needsReview,
        ...(det.note ? { note: det.note } : {}),
        ...(det.attributePatch ? { attributePatch: det.attributePatch } : {}),
      };
      return;
    }
    aiInputs.push(f);
    aiSlots.push(i);
  });

  // Pass 2: ONE batched AI call over the deterministic misses; align results back by slot.
  // Plan-gated: `opts.ai === false` skips the AI fallback, so free-tier scans still get the (free)
  // deterministic fixes above without ever calling the model.
  if (opts.ai !== false && aiInputs.length > 0) {
    const aiResults = await aiFixes(aiInputs);
    aiResults.forEach((r, j) => {
      if (r) out[aiSlots[j]!] = r;
    });
  }

  return out;
}
