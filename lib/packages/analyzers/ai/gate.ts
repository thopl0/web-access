/**
 * Confidence / abstention gate for the Tier-3 AI judges (plan §4: "structured output {verdict,
 * confidence, …}; first-class abstention; confidence used only to ROUTE").
 *
 * Both judges already write a precision-biased prompt ("only flag a CLEAR problem; default to ok").
 * This adds a SECOND, independent safety net: even when the model does flag something, it must also
 * say how sure it is, and a flag below the configured floor is dropped (the judge ABSTAINS — emits no
 * finding) rather than shown to the user. Two reasons it's separate from the prompt:
 *   1. It's a single, tunable knob (`AI_MIN_CONFIDENCE`) we can recalibrate against the eval corpus
 *      without touching prompts — exactly the "route by confidence, recalibrated on the eval set"
 *      the plan asks for (models are overconfident, so the floor is an empirical dial).
 *   2. It's shared: the text judge (GLM) and the vision judge (Gemma) gate identically.
 *
 * "Abstain" is not a model output here — it's the OUTCOME of a low-confidence flag. The judge stays
 * silent, which is indistinguishable downstream from "looked fine" (the harness's
 * `predictedNegativeRate` is the proxy that tracks how often that happens).
 */

/** Coarse confidence buckets. Deliberately NOT a 0–1 float: LLMs can't produce calibrated
 *  probabilities, but they pick "high / medium / low" reliably, and three buckets are all the routing
 *  (flag / abstain) actually needs. */
export type Confidence = "high" | "medium" | "low";

/** Rank for comparison; higher = more confident. */
const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

/**
 * Coerce a model's raw `confidence` field to a {@link Confidence}. Anything missing or unrecognised
 * becomes `"low"` — a precision-first default: if the model didn't clearly assert confidence, treat
 * the flag as a guess and let the gate drop it, rather than show a finding we can't stand behind.
 */
export function parseConfidence(raw: unknown): Confidence {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return v === "high" || v === "medium" || v === "low" ? v : "low";
}

/**
 * The minimum confidence a flag must meet to be SHOWN. Default `"medium"` — drop only the genuinely
 * unsure flags (`low`), which keeps recall while cutting the riskiest false positives; the judges'
 * own precision-biased prompts handle the rest. Override with `AI_MIN_CONFIDENCE=high` to be stricter
 * (precision over everything) or `low` to disable the gate (show every flag). Read lazily per call so
 * tests and the eval harness can flip it via the environment.
 *
 * Note the default differs from {@link parseConfidence}: an UNSET/garbage floor falls back to
 * `"medium"` (the gate default), NOT `"low"` — an absent override must never silently disable the gate.
 */
export function minConfidence(): Confidence {
  const v = (process.env.AI_MIN_CONFIDENCE ?? "").trim().toLowerCase();
  return v === "high" || v === "medium" || v === "low" ? v : "medium";
}

/** Does `confidence` clear the floor (so the flag should be shown)? */
export function meetsConfidence(confidence: Confidence, floor: Confidence = minConfidence()): boolean {
  return RANK[confidence] >= RANK[floor];
}
