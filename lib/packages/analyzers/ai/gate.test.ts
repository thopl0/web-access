/**
 * Deterministic guard for the confidence/abstention gate. No model — just the routing arithmetic and
 * the precision-first defaults that decide whether a flag is shown or dropped.
 */
import { describe, it, expect, afterEach } from "vitest";
import { parseConfidence, meetsConfidence, minConfidence } from "./gate";

const orig = process.env.AI_MIN_CONFIDENCE;
afterEach(() => {
  if (orig === undefined) delete process.env.AI_MIN_CONFIDENCE;
  else process.env.AI_MIN_CONFIDENCE = orig;
});

describe("parseConfidence", () => {
  it("accepts the three buckets case/space-insensitively", () => {
    expect(parseConfidence("HIGH")).toBe("high");
    expect(parseConfidence(" medium ")).toBe("medium");
    expect(parseConfidence("low")).toBe("low");
  });

  it("defaults missing/garbage to low (precision-first: an unstated confidence is a guess)", () => {
    expect(parseConfidence(undefined)).toBe("low");
    expect(parseConfidence("")).toBe("low");
    expect(parseConfidence("very sure")).toBe("low");
    expect(parseConfidence(0.9)).toBe("low");
  });
});

describe("meetsConfidence", () => {
  it("passes at or above the floor, fails below", () => {
    expect(meetsConfidence("high", "medium")).toBe(true);
    expect(meetsConfidence("medium", "medium")).toBe(true);
    expect(meetsConfidence("low", "medium")).toBe(false);
    expect(meetsConfidence("medium", "high")).toBe(false);
    expect(meetsConfidence("low", "low")).toBe(true); // floor=low disables the gate
  });
});

describe("minConfidence (env)", () => {
  it("defaults to medium when unset or garbage — never silently disables the gate", () => {
    delete process.env.AI_MIN_CONFIDENCE;
    expect(minConfidence()).toBe("medium");
    process.env.AI_MIN_CONFIDENCE = "nonsense";
    expect(minConfidence()).toBe("medium");
  });

  it("honours a valid override", () => {
    process.env.AI_MIN_CONFIDENCE = "high";
    expect(minConfidence()).toBe("high");
    process.env.AI_MIN_CONFIDENCE = "low";
    expect(minConfidence()).toBe("low");
  });
});
