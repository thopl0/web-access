import { describe, it, expect } from "vitest";

import { diffRuleSnapshots, type RuleSnapshot } from "./verification";

/** Build a RuleSnapshot with sane defaults; only `ruleId` matters to the set diff. */
function snap(ruleId: string, over: Partial<RuleSnapshot> = {}): RuleSnapshot {
  return {
    ruleId,
    message: `${ruleId} message`,
    impact: "serious",
    wcag: ["1.1.1"],
    spots: 1,
    pageCount: 1,
    ...over,
  };
}

const ids = (s: RuleSnapshot[]) => s.map((r) => r.ruleId).sort();

describe("diffRuleSnapshots — verification set diff", () => {
  it("classifies resolved / introduced / persisting by ruleId", () => {
    const previous = [snap("image-alt"), snap("color-contrast"), snap("link-name")];
    const current = [snap("color-contrast"), snap("link-name"), snap("html-has-lang")];

    const { resolved, introduced, persisting } = diffRuleSnapshots(previous, current);

    // In previous, gone from current → resolved (verified fix).
    expect(ids(resolved)).toEqual(["image-alt"]);
    // In current, absent from previous → introduced (regression / new).
    expect(ids(introduced)).toEqual(["html-has-lang"]);
    // In both → persisting.
    expect(ids(persisting)).toEqual(["color-contrast", "link-name"]);
  });

  it("matches purely by ruleId, ignoring other fields (and prefers current for persisting)", () => {
    const previous = [snap("color-contrast", { spots: 9, pageCount: 4, message: "old" })];
    const current = [snap("color-contrast", { spots: 2, pageCount: 1, message: "new" })];

    const { resolved, introduced, persisting } = diffRuleSnapshots(previous, current);

    expect(resolved).toHaveLength(0);
    expect(introduced).toHaveLength(0);
    expect(persisting).toHaveLength(1);
    // The persisting entry comes from the CURRENT snapshot (latest counts/message).
    expect(persisting[0].spots).toBe(2);
    expect(persisting[0].message).toBe("new");
  });

  it("empty previous → everything introduced, nothing resolved", () => {
    const current = [snap("image-alt"), snap("color-contrast")];

    const { resolved, introduced, persisting } = diffRuleSnapshots([], current);

    expect(resolved).toEqual([]);
    expect(ids(introduced)).toEqual(["color-contrast", "image-alt"]);
    expect(persisting).toEqual([]);
  });

  it("empty current → everything resolved, nothing introduced", () => {
    const previous = [snap("image-alt"), snap("color-contrast")];

    const { resolved, introduced, persisting } = diffRuleSnapshots(previous, []);

    expect(ids(resolved)).toEqual(["color-contrast", "image-alt"]);
    expect(introduced).toEqual([]);
    expect(persisting).toEqual([]);
  });

  it("identical snapshots → all persisting, none resolved or introduced", () => {
    const rules = [snap("image-alt"), snap("color-contrast"), snap("link-name")];

    const { resolved, introduced, persisting } = diffRuleSnapshots(rules, [...rules]);

    expect(resolved).toEqual([]);
    expect(introduced).toEqual([]);
    expect(ids(persisting)).toEqual(["color-contrast", "image-alt", "link-name"]);
  });

  it("both empty → all three empty", () => {
    const { resolved, introduced, persisting } = diffRuleSnapshots([], []);
    expect(resolved).toEqual([]);
    expect(introduced).toEqual([]);
    expect(persisting).toEqual([]);
  });
});
