// One domain, one account. Once a site is registered to a user we don't let a DIFFERENT account
// register the same domain — that both matches the obvious "this is my site" expectation and closes
// the cheap-abuse path of farming the same target across throwaway free accounts.
//
// Matching is by normalized HOST (scheme- and www-insensitive, port-stripped, lowercased), since the
// `sites.origin` column stores a full `scheme://host[:port]` and the same site is commonly added as
// http/https or with/without `www`. Anonymous trial sites (ownerId null) are deliberately ignored:
// they're created for arbitrary URLs people paste into the homepage scanner and must never block a
// real owner from later claiming their own domain.
import { and, isNotNull, ne } from "drizzle-orm";

import { db, schema } from "./db";

/** Normalized host for claim comparison: lowercased, `www.` stripped, port removed. "" if unparseable. */
export function hostOf(originOrUrl: string): string {
  try {
    const u = new URL(originOrUrl);
    return u.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Is this domain already registered to a DIFFERENT account? Compares the candidate's normalized host
 * against every owned site's host. Owned-site counts are small at this stage, so a scan is fine; if it
 * ever grows, back this with a normalized `domain` column + index.
 */
export async function domainOwnedByOther(originOrUrl: string, userId: string): Promise<boolean> {
  const host = hostOf(originOrUrl);
  if (!host) return false;

  const rows = await db
    .select({ origin: schema.sites.origin })
    .from(schema.sites)
    .where(and(isNotNull(schema.sites.ownerId), ne(schema.sites.ownerId, userId)));

  return rows.some((r) => r.origin && hostOf(r.origin) === host);
}
