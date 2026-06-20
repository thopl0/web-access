import { describe, it, expect } from "vitest";
import {
  PLANS,
  PLAN_ORDER,
  normalizePlan,
  entitlementsFor,
  canAddSite,
  withinPageQuota,
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
      expect(PLANS[plan].pagesPerMonth).toBeGreaterThanOrEqual(PLANS.free.pagesPerMonth);
    }
    // Feature flags off on free — including the concrete fixes (diagnosis-only).
    expect(PLANS.free.fixes).toBe(false);
    expect(PLANS.free.aiJudge).toBe(false);
    expect(PLANS.free.artifacts).toBe(false);
    expect(PLANS.free.monitoring).toBe(false);
    expect(PLANS.free.runtimeRemediation).toBe(false);
  });
  it("paid plans grant the concrete fixes", () => {
    expect(PLANS.pro.fixes).toBe(true);
    expect(PLANS.business.fixes).toBe(true);
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

describe("withinPageQuota", () => {
  it("is true below the cap and false at/over it", () => {
    expect(withinPageQuota("free", 0)).toBe(true);
    expect(withinPageQuota("free", PLANS.free.pagesPerMonth - 1)).toBe(true);
    expect(withinPageQuota("free", PLANS.free.pagesPerMonth)).toBe(false);
    expect(withinPageQuota("free", PLANS.free.pagesPerMonth + 5)).toBe(false);
  });
  it("pro has a larger monthly budget than free", () => {
    expect(withinPageQuota("pro", PLANS.free.pagesPerMonth)).toBe(true);
    expect(withinPageQuota("pro", PLANS.pro.pagesPerMonth)).toBe(false);
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
