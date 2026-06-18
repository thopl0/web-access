import "server-only";

import { and, asc, eq } from "drizzle-orm";
import type { RemediationManifest } from "@web-access/shared";
import { db, schema } from "./db";
import { buildManifest } from "./remediation-manifest";
import { entitlementsFor, getUserPlan } from "./entitlements";

/**
 * Phase C runtime remediation — the server side of the embed's "apply safe attribute patches to the
 * live DOM" capability. This module turns the owner-approved `remediations` rows into the compact
 * `RemediationManifest` the public endpoint serves to the embed.
 *
 * Safety is load-bearing here (see plan): the manifest must ONLY ever contain patches the owner
 * explicitly approved, ONLY on attributes in the safe non-visual allowlist, and ONLY when the site's
 * master opt-in is on. The defensive safe-attr filtering lives in `buildManifest` (a pure helper in
 * remediation-manifest.ts) so it's unit-testable without dragging in `server-only`/the DB.
 */

export { buildManifest } from "./remediation-manifest";

/**
 * The manifest of ENABLED, approved attribute patches for a site — what the public endpoint returns
 * to the embed. Returns an empty manifest unless the site's master opt-in (`runtimeRemediation`) is
 * on, so turning the toggle off instantly stops every patch without touching the approved rows.
 */
export async function getRemediationManifest(siteId: string): Promise<RemediationManifest> {
  const site = await db
    .select({ runtimeRemediation: schema.sites.runtimeRemediation, ownerId: schema.sites.ownerId })
    .from(schema.sites)
    .where(eq(schema.sites.id, siteId))
    .limit(1);
  // Unknown site, or opt-in off → serve nothing.
  if (site.length === 0 || !site[0]!.runtimeRemediation) return { entries: [] };

  // Plan gate (downgrade safety): if the owner is no longer on a plan that includes runtime
  // remediation, serve nothing even though the toggle row is still on. Unowned system sites pass.
  const ownerId = site[0]!.ownerId;
  if (ownerId && !entitlementsFor(await getUserPlan(ownerId)).runtimeRemediation) {
    return { entries: [] };
  }

  const rows = await db
    .select({
      selector: schema.remediations.selector,
      attr: schema.remediations.attr,
      value: schema.remediations.value,
      enabled: schema.remediations.enabled,
    })
    .from(schema.remediations)
    .where(and(eq(schema.remediations.siteId, siteId), eq(schema.remediations.enabled, true)))
    .orderBy(asc(schema.remediations.selector), asc(schema.remediations.attr));

  return buildManifest(rows);
}
