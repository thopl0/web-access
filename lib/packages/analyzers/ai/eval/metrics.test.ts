/**
 * Deterministic regression guard for the eval SCORER. The live accuracy run needs API keys, costs
 * money, and is non-deterministic, so the scoring math is pinned here instead — if these numbers
 * drift, every accuracy report drifts with them, silently. No model is involved: we hand `score`
 * synthetic gold/predicted pairs and assert the arithmetic.
 */
import { describe, it, expect } from "vitest";
import { score } from "./metrics";
import { runEval } from "./harness";
import { OK, type EvalCase, type Prediction } from "./types";

const pred = (gold: string, predicted: string, errored = false): Prediction => ({
  id: `${gold}/${predicted}`,
  context: "test",
  gold,
  predicted,
  errored,
});

describe("score", () => {
  it("computes per-class precision/recall/f1", () => {
    // class A: 2 gold, predicted twice, 1 correct → P 1/2, R 1/2
    const m = score([
      pred("A", "A"), // tp
      pred("A", OK), // miss (gold A, said ok)
      pred(OK, "A"), // false positive
    ]);
    const a = m.classes.find((c) => c.label === "A")!;
    expect(a.support).toBe(2);
    expect(a.predicted).toBe(2);
    expect(a.truePositives).toBe(1);
    expect(a.precision).toBeCloseTo(0.5);
    expect(a.recall).toBeCloseTo(0.5);
    expect(a.f1).toBeCloseTo(0.5);
  });

  it("collapses all problem classes for the binary detection view", () => {
    // gold problems: A,B,A (3). detected as problem: A(tp), C(tp wrong subtype but still a flag), ok(miss).
    // false positive: gold ok predicted B.
    const m = score([
      pred("A", "A"), // detection tp
      pred("B", "C"), // detection tp (flagged a real problem, wrong subtype)
      pred("A", OK), // detection fn
      pred(OK, "B"), // detection fp
      pred(OK, OK), // true negative
    ]);
    // tp=2, fp=1, fn=1 → P 2/3, R 2/3
    expect(m.detection.precision).toBeCloseTo(2 / 3);
    expect(m.detection.recall).toBeCloseTo(2 / 3);
  });

  it("tracks ok specificity and predicted-negative rate", () => {
    const m = score([
      pred(OK, OK), // gold-ok left alone
      pred(OK, "A"), // gold-ok wrongly flagged
      pred("A", "A"),
      pred("A", OK),
    ]);
    expect(m.okSpecificity).toBeCloseTo(0.5); // 1 of 2 gold-ok correctly left alone
    expect(m.predictedNegativeRate).toBeCloseTo(0.5); // 2 of 4 predicted ok
  });

  it("excludes errored predictions from every rate but counts them", () => {
    const m = score([pred("A", "A"), pred("A", OK, true)]);
    expect(m.total).toBe(2);
    expect(m.errors).toBe(1);
    expect(m.scored).toBe(1);
    expect(m.detection.recall).toBeCloseTo(1); // the errored miss is NOT scored as a miss
  });

  it("builds a confusion matrix", () => {
    const m = score([pred("A", "A"), pred("A", "B"), pred(OK, OK)]);
    expect(m.confusion["A→A"]).toBe(1);
    expect(m.confusion["A→B"]).toBe(1);
    expect(m.confusion["ok→ok"]).toBe(1);
  });
});

describe("runEval", () => {
  it("turns a thrown judge call into an errored prediction, not a crash", async () => {
    const cases: EvalCase<number>[] = [
      { id: "good", context: "t", input: 1, gold: "A", notes: "" },
      { id: "boom", context: "t", input: 2, gold: "A", notes: "" },
    ];
    const judge = async (n: number) => {
      if (n === 2) throw new Error("model down");
      return "A";
    };
    const { predictions, metrics } = await runEval(cases, judge, { concurrency: 1 });
    expect(predictions.find((p) => p.id === "boom")!.errored).toBe(true);
    expect(metrics.errors).toBe(1);
    expect(metrics.scored).toBe(1);
  });
});
