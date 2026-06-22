import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";

import { db, schema } from "./db";
import { getScanDelta } from "./verification";

/**
 * In-app notifications — the bell in the top bar. There's no events table: the feed is DERIVED from the
 * data we already keep (completed scans = "page crawls", and the per-site scan delta = "new issues"),
 * compared against a single per-user "last seen" marker (`users.notificationsSeenAt`). Anything that
 * happened after that marker is unread.
 *
 * A "crawl" is one (site, release) — many per-template scan rows roll up to it. We only attach the
 * new/resolved-issue counts to each site's LATEST crawl (that's what `getScanDelta` compares), so the
 * feed reads "re-scanned, 2 new issues" without diffing every historical crawl.
 */

/** Only ever surface the last 30 days, so a brand-new bell (never opened) doesn't show all of history. */
const RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * A crawl is "notable" (worth a notification) only if it scanned more than one page — i.e. a real
 * site crawl, not one of the frequent single-page embed re-scan pings that would otherwise drown the
 * feed in "re-scanned · 1 page · no change" noise. SQL HAVING over the per-crawl distinct-URL count.
 * (Trade-off: a genuinely single-page site never notifies; acceptable — those are rare and the
 * per-site report's "what changed" panel still covers issue changes.)
 */
const NOTABLE_CRAWL = sql`count(distinct ${schema.scans.url}) > 1`;

export type NotificationItem = {
  /** `${siteId}:${releaseId}` — stable per crawl. */
  id: string;
  siteId: string;
  siteName: string;
  /** ISO time the crawl completed. */
  at: string;
  /** Pages scanned in this crawl. */
  pages: number;
  /** Newly-introduced issues (only computed for a site's latest crawl; 0 otherwise). */
  introduced: number;
  /** Issues confirmed fixed since the previous crawl (latest crawl only). */
  resolved: number;
  /** True for the most-recent crawl of its site — the one the delta counts belong to. */
  isLatestForSite: boolean;
  /** Happened after the owner last opened the bell. */
  unread: boolean;
};

async function ownedSiteIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: schema.sites.id })
    .from(schema.sites)
    .where(eq(schema.sites.ownerId, userId));
  return rows.map((r) => r.id);
}

async function seenAt(userId: string): Promise<Date | null> {
  const row = (
    await db
      .select({ at: schema.users.notificationsSeenAt })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1)
  )[0];
  return row?.at ?? null;
}

/**
 * Cheap unread count for the badge — distinct (site, release) crawls newer than the marker. Runs in the
 * app layout on every dashboard page, so it deliberately avoids the per-site delta work the feed does.
 */
export async function countUnreadNotifications(userId: string): Promise<number> {
  const siteIds = await ownedSiteIds(userId);
  if (siteIds.length === 0) return 0;
  const threshold = (await seenAt(userId)) ?? new Date(Date.now() - RECENT_WINDOW_MS);
  const rows = await db
    .select({ siteId: schema.scans.siteId, releaseId: schema.scans.releaseId })
    .from(schema.scans)
    .where(
      and(
        inArray(schema.scans.siteId, siteIds),
        eq(schema.scans.status, "complete"),
        gt(schema.scans.completedAt, threshold),
      ),
    )
    .groupBy(schema.scans.siteId, schema.scans.releaseId)
    .having(NOTABLE_CRAWL);
  return rows.length;
}

/** The full feed (recent crawls + new/resolved-issue counts on each site's latest crawl). */
export async function getNotificationFeed(userId: string): Promise<NotificationItem[]> {
  const siteIds = await ownedSiteIds(userId);
  if (siteIds.length === 0) return [];

  const names = new Map(
    (
      await db
        .select({ id: schema.sites.id, name: schema.sites.name })
        .from(schema.sites)
        .where(eq(schema.sites.ownerId, userId))
    ).map((s) => [s.id, s.name] as const),
  );
  const seen = await seenAt(userId);
  const windowStart = new Date(Date.now() - RECENT_WINDOW_MS);

  const crawls = await db
    .select({
      siteId: schema.scans.siteId,
      releaseId: schema.scans.releaseId,
      at: sql<string>`max(${schema.scans.completedAt})`,
      pages: sql<number>`count(distinct ${schema.scans.url})`,
    })
    .from(schema.scans)
    .where(
      and(
        inArray(schema.scans.siteId, siteIds),
        eq(schema.scans.status, "complete"),
        gt(schema.scans.completedAt, windowStart),
      ),
    )
    .groupBy(schema.scans.siteId, schema.scans.releaseId)
    .having(NOTABLE_CRAWL)
    .orderBy(desc(sql`max(${schema.scans.completedAt})`))
    .limit(20);

  const seenSites = new Set<string>();
  const items: NotificationItem[] = [];
  for (const c of crawls) {
    const isLatest = !seenSites.has(c.siteId);
    seenSites.add(c.siteId);

    let introduced = 0;
    let resolved = 0;
    if (isLatest) {
      const delta = await getScanDelta(c.siteId);
      if (delta?.hasPrevious) {
        introduced = delta.introduced.length;
        resolved = delta.resolved.length;
      }
    }

    const at = new Date(c.at);
    items.push({
      id: `${c.siteId}:${c.releaseId}`,
      siteId: c.siteId,
      siteName: names.get(c.siteId) ?? "Site",
      at: at.toISOString(),
      pages: Number(c.pages),
      introduced,
      resolved,
      isLatestForSite: isLatest,
      unread: seen ? at > seen : true,
    });
  }
  return items;
}
