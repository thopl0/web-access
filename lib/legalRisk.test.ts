import { describe, it, expect } from "vitest";
import {
  legalRiskOf,
  rankByLegalRisk,
  RISK_TIER_LABEL,
  type RiskTier,
  type LegalRisk,
} from "./legalRisk";

/** Convenience: score with no WCAG tags and no impact (isolates the per-rule base risk). */
function bare(ruleId: string): LegalRisk {
  return legalRiskOf(ruleId, [], null);
}

describe("legalRiskOf — high-litigation rules outrank low ones", () => {
  // These are the recurring ADA Title III / EAA complaint patterns; they must score "high".
  const HIGH = [
    "image-alt",
    "input-image-alt",
    "decorative-misclassified",
    "label",
    "select-name",
    "color-contrast",
    "link-name",
    "button-name",
    "html-has-lang",
    "document-title",
    "scrollable-region-focusable",
    "alt-text-inaccurate",
  ];
  // Real issues, but rarely the basis for a legal claim on their own.
  const LOW = [
    "heading-order",
    "heading-uninformative",
    "duplicate-id",
    "meta-refresh",
    "target-size",
    "color-contrast-enhanced",
    "list",
    "region",
    "alt-text-redundant",
  ];

  it("classifies the top litigation rules as high tier", () => {
    for (const ruleId of HIGH) {
      expect(bare(ruleId).tier, `${ruleId} should be high`).toBe("high");
    }
  });

  it("classifies low-stakes rules below high tier", () => {
    for (const ruleId of LOW) {
      expect(bare(ruleId).tier, `${ruleId} should not be high`).not.toBe("high");
    }
  });

  it("gives every high rule a strictly greater weight than every low rule", () => {
    const minHigh = Math.min(...HIGH.map((r) => bare(r).weight));
    const maxLow = Math.max(...LOW.map((r) => bare(r).weight));
    expect(minHigh).toBeGreaterThan(maxLow);
  });
});

describe("legalRiskOf — unknown ruleIds get the safe default", () => {
  it("defaults unknown rules to medium tier (never silently dismissed, never overstated)", () => {
    const risk = bare("totally-made-up-rule-xyz");
    expect(risk.tier).toBe("medium");
  });

  it("scores an unknown rule below a known high rule and above a known low rule", () => {
    const unknown = bare("totally-made-up-rule-xyz").weight;
    expect(unknown).toBeLessThan(bare("image-alt").weight);
    expect(unknown).toBeGreaterThan(bare("duplicate-id").weight);
  });

  it("gives unknown rules a non-alarmist explanatory sentence", () => {
    const why = bare("totally-made-up-rule-xyz").why;
    expect(why.length).toBeGreaterThan(0);
    expect(why).toMatch(/complaint/i);
  });
});

describe("legalRiskOf — WCAG level and impact modifiers", () => {
  it("raises weight when a Level A success criterion is tagged", () => {
    const aaOnly = legalRiskOf("color-contrast", ["1.4.3"], null); // 1.4.3 is AA
    const levelA = legalRiskOf("color-contrast", ["1.4.1"], null); // 1.4.1 is A
    expect(levelA.weight).toBeGreaterThan(aaOnly.weight);
  });

  it("raises weight for higher user impact, in order critical > serious > moderate > minor", () => {
    const w = (impact: string | null) => legalRiskOf("label", ["1.3.1"], impact).weight;
    expect(w("critical")).toBeGreaterThan(w("serious"));
    expect(w("serious")).toBeGreaterThan(w("moderate"));
    expect(w("moderate")).toBeGreaterThan(w("minor"));
  });

  it("treats null/unknown impact as neutral (same as moderate)", () => {
    expect(legalRiskOf("label", [], null).weight).toBe(
      legalRiskOf("label", [], "moderate").weight,
    );
    expect(legalRiskOf("label", [], "not-a-real-impact").weight).toBe(
      legalRiskOf("label", [], "moderate").weight,
    );
  });

  it("clamps the weight to the 0..100 range", () => {
    const maxed = legalRiskOf("image-alt", ["1.1.1"], "critical");
    expect(maxed.weight).toBeLessThanOrEqual(100);
    expect(maxed.weight).toBeGreaterThanOrEqual(0);
  });
});

describe("legalRiskOf — tier and weight are internally consistent", () => {
  const SAMPLE: Array<{ ruleId: string; wcag: string[]; impact: string | null }> = [
    { ruleId: "image-alt", wcag: ["1.1.1"], impact: "critical" },
    { ruleId: "color-contrast", wcag: ["1.4.3"], impact: "serious" },
    { ruleId: "label", wcag: ["1.3.1"], impact: "critical" },
    { ruleId: "heading-order", wcag: [], impact: "minor" },
    { ruleId: "duplicate-id", wcag: [], impact: "minor" },
    { ruleId: "unknown-rule", wcag: [], impact: null },
    { ruleId: "meta-viewport", wcag: ["1.4.4"], impact: "serious" },
    { ruleId: "alt-text-redundant", wcag: [], impact: "minor" },
  ];

  it("never places a higher weight in a lower tier than a lower weight (monotonic tiers)", () => {
    const rank: Record<RiskTier, number> = { high: 3, medium: 2, low: 1 };
    const scored = SAMPLE.map((s) => legalRiskOf(s.ruleId, s.wcag, s.impact)).sort(
      (a, b) => b.weight - a.weight,
    );
    for (let i = 1; i < scored.length; i++) {
      // As weight decreases (or ties), tier rank must not increase.
      expect(rank[scored[i].tier]).toBeLessThanOrEqual(rank[scored[i - 1].tier]);
    }
  });

  it("agrees: tier derived from weight matches the published cutoffs", () => {
    for (const s of SAMPLE) {
      const { tier, weight } = legalRiskOf(s.ruleId, s.wcag, s.impact);
      if (tier === "high") expect(weight).toBeGreaterThanOrEqual(55);
      else if (tier === "medium") {
        expect(weight).toBeGreaterThanOrEqual(30);
        expect(weight).toBeLessThan(55);
      } else expect(weight).toBeLessThan(30);
    }
  });
});

describe("rankByLegalRisk — sorts highest-risk first and is stable", () => {
  type Item = { ruleId: string; wcag: string[]; impact: string | null; selector: string };

  it("orders findings from highest to lowest legal exposure", () => {
    const items: Item[] = [
      { ruleId: "heading-order", wcag: [], impact: "minor", selector: "#h" },
      { ruleId: "image-alt", wcag: ["1.1.1"], impact: "critical", selector: "#img" },
      { ruleId: "form-error-unclear", wcag: ["3.3.1"], impact: "moderate", selector: "#err" },
    ];
    const ranked = rankByLegalRisk(items);
    expect(ranked.map((r) => r.item.selector)).toEqual(["#img", "#err", "#h"]);
    // Weights are non-increasing.
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].risk.weight).toBeLessThanOrEqual(ranked[i - 1].risk.weight);
    }
  });

  it("is STABLE: equal-weight findings keep their original relative order", () => {
    // Same rule + tags + impact => identical weight; order must be preserved by original index.
    const items: Item[] = [
      { ruleId: "image-alt", wcag: ["1.1.1"], impact: "critical", selector: "#a" },
      { ruleId: "image-alt", wcag: ["1.1.1"], impact: "critical", selector: "#b" },
      { ruleId: "image-alt", wcag: ["1.1.1"], impact: "critical", selector: "#c" },
    ];
    const ranked = rankByLegalRisk(items);
    expect(ranked.map((r) => r.item.selector)).toEqual(["#a", "#b", "#c"]);
  });

  it("preserves the original order across interleaved equal-weight groups", () => {
    const items: Item[] = [
      { ruleId: "image-alt", wcag: [], impact: null, selector: "high-1" },
      { ruleId: "duplicate-id", wcag: [], impact: null, selector: "low-1" },
      { ruleId: "image-alt", wcag: [], impact: null, selector: "high-2" },
      { ruleId: "duplicate-id", wcag: [], impact: null, selector: "low-2" },
    ];
    const ranked = rankByLegalRisk(items);
    expect(ranked.map((r) => r.item.selector)).toEqual(["high-1", "high-2", "low-1", "low-2"]);
  });

  it("returns an empty array for empty input", () => {
    expect(rankByLegalRisk([])).toEqual([]);
  });
});

describe("RISK_TIER_LABEL", () => {
  it("has a human label for every tier", () => {
    const tiers: RiskTier[] = ["high", "medium", "low"];
    for (const t of tiers) {
      expect(RISK_TIER_LABEL[t]).toBeTruthy();
    }
  });
});
