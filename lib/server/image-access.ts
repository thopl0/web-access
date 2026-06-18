import { and, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db, schema } from "./db";

/**
 * Authorize a request to view a site's images, mirroring the two ways a report is viewed:
 *   1. the authenticated **owner** of the site, or
 *   2. anyone presenting a valid **share token** for the site (public read-only report links).
 *
 * Used by the screenshot/evidence route handlers, which replaced the old inline-base64 approach.
 */
export async function canViewSite(siteId: string, token: string | null): Promise<boolean> {
  // Share-token path — no session required. A null/empty token can never match a row.
  if (token) {
    const shared = await db
      .select({ id: schema.sites.id })
      .from(schema.sites)
      .where(and(eq(schema.sites.id, siteId), eq(schema.sites.shareToken, token)))
      .limit(1);
    if (shared[0]) return true;
  }

  // Owner path — cryptographically verified session, then an ownership check.
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return false;
  const owned = await db
    .select({ id: schema.sites.id })
    .from(schema.sites)
    .where(and(eq(schema.sites.id, siteId), eq(schema.sites.ownerId, userId)))
    .limit(1);
  return Boolean(owned[0]);
}
