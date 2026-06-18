import { describe, it, expect } from "vitest";
import {
  PLANS,
  PLAN_ORDER,
  normalizePlan,
  entitlementsFor,
  canAddSite,
  withinScanQuota,
  isPaidPlan,
} from "./entitlements";

describe("normalizePlan", () => {
  it("passes through known paid plans", () => {
    expect(normalizePlan("pro")).toBe("pro");
    expect(normalizePlan("business")).toBe("business");
  });
  it("defaults anything unknown/empty to free", () => {
    expect(normalizePlan("free")).toBe("free");
    expect(normalizePlan(null)).toBe("free");
    expect(normalizePlan(undefined)).toBe("free");
    expect(normalizePlan("")).toBe("free");
    expect(normalizePlan("enterprise")).toBe("free");
  });
});

describe("entitlementsFor", () => {
  it("returns the matching entitlement table entry", () => {
    expect(entitlementsFor("pro")).toBe(PLANS.pro);
  });
  it("falls back to free for unknown values", () => {
    expect(entitlementsFor("nope")).toBe(PLANS.free);
  });
  it("free is the most restrictive across every dimension", () => {
    for (const plan of PLAN_ORDER) {
      expect(PLANS[plan].maxSites).toBeGreaterThanOrEqual(PLANS.free.maxSites);
      expect(PLANS[plan].scansPerMonth).toBeGreaterThanOrEqual(PLANS.free.scansPerMonth);
    }
    // Feature flags off on free.
    expect(PLANS.free.aiJudge).toBe(false);
    expect(PLANS.free.artifacts).toBe(false);
    expect(PLANS.free.monitoring).toBe(false);
    expect(PLANS.free.runtimeRemediation).toBe(false);
  });
});

describe("canAddSite", () => {
  it("free allows up to its single-site cap, then blocks", () => {
    expect(canAddSite("free", 0)).toBe(true); // 0 < 1
    expect(canAddSite("free", 1)).toBe(false); // at cap
    expect(canAddSite("free", 2)).toBe(false); // over cap
  });
  it("pro allows more sites than free", () => {
    expect(canAddSite("pro", PLANS.free.maxSites)).toBe(true);
    expect(canAddSite("pro", PLANS.pro.maxSites - 1)).toBe(true);
    expect(canAddSite("pro", PLANS.pro.maxSites)).toBe(false);
  });
  it("treats unknown plan as free", () => {
    expect(canAddSite("bogus", 1)).toBe(false);
  });
});

describe("withinScanQuota", () => {
  it("is true below the cap and false at/over it", () => {
    expect(withinScanQuota("free", 0)).toBe(true);
    expect(withinScanQuota("free", PLANS.free.scansPerMonth - 1)).toBe(true);
    expect(withinScanQuota("free", PLANS.free.scansPerMonth)).toBe(false);
    expect(withinScanQuota("free", PLANS.free.scansPerMonth + 5)).toBe(false);
  });
  it("pro has a larger monthly budget than free", () => {
    expect(withinScanQuota("pro", PLANS.free.scansPerMonth)).toBe(true);
    expect(withinScanQuota("pro", PLANS.pro.scansPerMonth)).toBe(false);
  });
});

describe("isPaidPlan", () => {
  it("is false for free / unknown and true for paid tiers", () => {
    expect(isPaidPlan("free")).toBe(false);
    expect(isPaidPlan(null)).toBe(false);
    expect(isPaidPlan("nope")).toBe(false);
    expect(isPaidPlan("pro")).toBe(true);
    expect(isPaidPlan("business")).toBe(true);
  });
});
