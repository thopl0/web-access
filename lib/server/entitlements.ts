// NOTE: deliberately NOT `import "server-only"` — `ownerEntitlements` is used by the BullMQ worker
// (to gate the AI tiers by the site owner's plan), which runs under plain tsx where server-only
// throws at import. Same constraint as lib/server/scan.ts. Client components must import the pure
// helpers from lib/entitlements.ts (or go through server actions), never this DB-reading module.
//
// Server-side entitlement reads: turn a userId into "what plan are they on" and "how much have they
// used". The gating MATH lives in the pure lib/entitlements.ts (client-safe, unit-tested); this layer
// only does the DB lookups and re-exports those helpers so callers import from one place.
import { and, count, eq, gte, inArray } from "drizzle-orm";

import { db, schema } from "./db";
import {
  type Entitlements,
  type Plan,
  entitlementsFor,
  normalizePlan,
} from "@/lib/entitlements";

// Re-export the pure helpers so server callers (actions, routes) import everything from here.
export {
  type Plan,
  type Entitlements,
  PLANS,
  entitlementsFor,
  canAddSite,
  withinPageQuota,
  isPaidPlan,
  normalizePlan,
} from "@/lib/entitlements";

/** The user's current plan, normalized. Defaults to "free" (missing user, null column, bad value). */
export async function getUserPlan(userId: string): Promise<Plan> {
  const rows = await db
    .select({ plan: schema.users.plan })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return normalizePlan(rows[0]?.plan);
}

/** Full entitlement table entry for the user's current plan. */
export async function getUserEntitlements(userId: string): Promise<Entitlements> {
  return entitlementsFor(await getUserPlan(userId));
}

/**
 * Batch-resolve plans for many users in ONE query — the monitor tick's owner→plan lookup, where we'd
 * otherwise call `getUserPlan` (or `ownerEntitlements`) once per selected row. Users not found map to
 * nothing; callers fall back to "free" via `entitlementsFor(map.get(id))`. Returns a Map keyed by id.
 */
export async function getUserPlans(userIds: string[]): Promise<Map<string, Plan>> {
  const ids = [...new Set(userIds)];
  const map = new Map<string, Plan>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({ id: schema.users.id, plan: schema.users.plan })
    .from(schema.users)
    .where(inArray(schema.users.id, ids));
  for (const r of rows) map.set(r.id, normalizePlan(r.plan));
  return map;
}

/**
 * Entitlements for a SITE's owner — the gate used where we only have a siteId, not a session: the
 * worker (AI judge / enrichment / AI fixes) and the public runtime-remediation manifest.
 *
 * Unowned sites are now ONLY the homepage's anonymous trial scans (the old demo site is gone). Those
 * must run the cheapest possible pipeline — the "Free" tier — so an anonymous scan never spends metered
 * Gemma vision or GLM text: `free.aiJudge` is false, which the worker reads to skip ALL Tier-3 AI. The
 * public scan page teases the locked premium tiers instead (see lib/upsell.ts). Do NOT restore full
 * entitlements here — that was a demo-only convenience and every anonymous scan would pay for it.
 */
export async function ownerEntitlements(siteId: string): Promise<Entitlements> {
  const rows = await db
    .select({ ownerId: schema.sites.ownerId })
    .from(schema.sites)
    .where(eq(schema.sites.id, siteId))
    .limit(1);
  const ownerId = rows[0]?.ownerId;
  if (!ownerId) return entitlementsFor("free"); // unowned anonymous trial scan → deterministic only, no AI spend
  return entitlementsFor(await getUserPlan(ownerId));
}

/** How many sites the user owns right now (the `canAddSite` input). */
export async function countUserSites(userId: string): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(schema.sites)
    .where(eq(schema.sites.ownerId, userId));
  return rows[0]?.n ?? 0;
}

/** First instant of the current calendar month, used to scope the scan-quota window. */
function startOfMonth(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/**
 * Pages scanned this calendar month across ALL of the user's sites (the `withinPageQuota` input). One
 * scan row == one page render, so counting scan rows counts pages. Scans aren't FK-linked to users, so
 * we resolve the user's site ids first, then count scans created since the start of the month. Returns
 * 0 when the user owns no sites.
 */
export async function countUserPagesThisMonth(userId: string): Promise<number> {
  const siteRows = await db
    .select({ id: schema.sites.id })
    .from(schema.sites)
    .where(eq(schema.sites.ownerId, userId));
  const siteIds = siteRows.map((s) => s.id);
  if (siteIds.length === 0) return 0;

  const rows = await db
    .select({ n: count() })
    .from(schema.scans)
    .where(
      and(inArray(schema.scans.siteId, siteIds), gte(schema.scans.createdAt, startOfMonth())),
    );
  return rows[0]?.n ?? 0;
}

/**
 * Convenience for the ingest route / manual rescan: resolve a SITE's owner plan + this-month page
 * usage in one place, so the request seams can call `withinPageQuota(plan, used)`. Returns null when
 * the site is unowned (an anonymous trial) — callers treat null as "no quota gate applies".
 */
export async function ownerScanUsage(
  siteId: string,
): Promise<{ ownerId: string; plan: Plan; usedThisMonth: number } | null> {
  const rows = await db
    .select({ ownerId: schema.sites.ownerId })
    .from(schema.sites)
    .where(eq(schema.sites.id, siteId))
    .limit(1);
  const ownerId = rows[0]?.ownerId;
  if (!ownerId) return null;

  const [plan, usedThisMonth] = await Promise.all([
    getUserPlan(ownerId),
    countUserPagesThisMonth(ownerId),
  ]);
  return { ownerId, plan, usedThisMonth };
}
