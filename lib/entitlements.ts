// Plans + entitlements — the SINGLE source of truth for "what does each plan get". Deliberately
// PURE and client-safe (no imports, no server-only, no DB): the pricing page, the account UI, the
// server enforcement layer, and the unit tests all read from the same table here. The numbers are
// placeholders — change them in one place (PLANS) and every gate, label, and pricing card follows.
//
// Server-side reads (current plan, usage counts) live in lib/server/entitlements.ts, which re-exports
// these helpers; nothing here touches the database.

/** The three plan tiers. `plan` on a user defaults to "free". */
export type Plan = "free" | "pro" | "business";

/** The full set of plans, in display order (cheapest → richest). */
export const PLAN_ORDER: readonly Plan[] = ["free", "pro", "business"] as const;

/** What a single plan grants. Booleans gate features; numbers cap quantities. */
export type Entitlements = {
  /** Human label for the plan ("Free", "Pro", "Business"). */
  label: string;
  /** Max number of sites the user may register. */
  maxSites: number;
  /** Max scans across all the user's sites per calendar month. */
  scansPerMonth: number;
  /** Tier-3 AI judge (alt-text quality) runs for this owner's scans. */
  aiJudge: boolean;
  /** Scheduled re-crawl / change monitoring. */
  monitoring: boolean;
  /** Downloadable artifacts (certificate / statement / VPAT / fix-pack). */
  artifacts: boolean;
  /** Phase-C runtime DOM remediation (the embed applies approved patches live). */
  runtimeRemediation: boolean;
  /** Number of team members (1 = solo, no team). */
  teamSeats: number;
};

/**
 * The entitlement table. These limits are intentionally round, conservative placeholders — the point
 * is that they're centralized and trivially editable, not that they're final business numbers.
 *
 * Free   — one site, a usable monthly scan budget, deterministic checks only (no AI / artifacts).
 * Pro    — the "shipping team" plan: more sites, the AI judge, monitoring, artifacts, runtime fixes.
 * Business — agency scale: many sites, a big scan pool, team seats, everything Pro has.
 */
export const PLANS: Record<Plan, Entitlements> = {
  free: {
    label: "Free",
    maxSites: 1,
    scansPerMonth: 30,
    aiJudge: false,
    monitoring: false,
    artifacts: false,
    runtimeRemediation: false,
    teamSeats: 1,
  },
  pro: {
    label: "Pro",
    maxSites: 10,
    scansPerMonth: 1000,
    aiJudge: true,
    monitoring: true,
    artifacts: true,
    runtimeRemediation: true,
    teamSeats: 1,
  },
  business: {
    label: "Business",
    maxSites: 50,
    scansPerMonth: 10000,
    aiJudge: true,
    monitoring: true,
    artifacts: true,
    runtimeRemediation: true,
    teamSeats: 10,
  },
};

/** Narrow an arbitrary string (e.g. a DB column) to a known Plan, falling back to "free". */
export function normalizePlan(value: string | null | undefined): Plan {
  return value === "pro" || value === "business" ? value : "free";
}

/** Entitlements for a plan. Accepts a raw string and normalizes, so DB reads are safe. */
export function entitlementsFor(plan: Plan | string | null | undefined): Entitlements {
  return PLANS[normalizePlan(plan)];
}

/** Whether a user on `plan` may add another site given how many they already have. */
export function canAddSite(plan: Plan | string | null | undefined, currentCount: number): boolean {
  return currentCount < entitlementsFor(plan).maxSites;
}

/** Whether a user on `plan` is still within their monthly scan budget given usage so far. */
export function withinScanQuota(
  plan: Plan | string | null | undefined,
  usedThisMonth: number,
): boolean {
  return usedThisMonth < entitlementsFor(plan).scansPerMonth;
}

/** A paid plan is anything that isn't free — i.e. backed by a Stripe subscription. */
export function isPaidPlan(plan: Plan | string | null | undefined): boolean {
  return normalizePlan(plan) !== "free";
}
