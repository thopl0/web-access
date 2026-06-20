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
  /**
   * Max PAGES scanned across all the user's sites per calendar month. One scan == one page render
   * (a crawl fans out into one scan per page), so the scan-row count is the page count — this caps
   * pages, and the UI is labelled in pages to match.
   */
  pagesPerMonth: number;
  /**
   * Concrete before→after fixes (the paste-ready corrections + the AI-builder prompt) are shown for
   * this owner's scans. Free is DIAGNOSIS-ONLY: it still surfaces every issue and a plain-language
   * reason it matters, but the fixes themselves are a paid feature.
   */
  fixes: boolean;
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
 * Free   — one site, a usable monthly PAGE budget, deterministic checks only. DIAGNOSIS-ONLY: it shows
 *          what's wrong and why, but not the fixes, AI, or artifacts.
 * Pro    — the "shipping team" plan: more sites/pages, the concrete fixes, the AI judge, monitoring,
 *          artifacts, runtime fixes.
 * Business — agency scale: many sites, a big page pool, team seats, everything Pro has.
 */
export const PLANS: Record<Plan, Entitlements> = {
  free: {
    label: "Free",
    maxSites: 1,
    pagesPerMonth: 30,
    fixes: false,
    aiJudge: false,
    monitoring: false,
    artifacts: false,
    runtimeRemediation: false,
    teamSeats: 1,
  },
  pro: {
    label: "Pro",
    maxSites: 10,
    pagesPerMonth: 1000,
    fixes: true,
    aiJudge: true,
    monitoring: true,
    artifacts: true,
    runtimeRemediation: true,
    teamSeats: 1,
  },
  business: {
    label: "Business",
    maxSites: 50,
    pagesPerMonth: 10000,
    fixes: true,
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

/** Whether a user on `plan` is still within their monthly PAGE budget given pages scanned so far. */
export function withinPageQuota(
  plan: Plan | string | null | undefined,
  usedThisMonth: number,
): boolean {
  return usedThisMonth < entitlementsFor(plan).pagesPerMonth;
}

/** A paid plan is anything that isn't free — i.e. backed by a Stripe subscription. */
export function isPaidPlan(plan: Plan | string | null | undefined): boolean {
  return normalizePlan(plan) !== "free";
}
