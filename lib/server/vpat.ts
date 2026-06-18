import "server-only";

import { and, eq } from "drizzle-orm";

import { db, schema } from "./db";
import { getSitePages, rollupByRule } from "./report";
import { buildChecklist, summarizeConformance } from "@/lib/wcag";
import { buildVpatModel, type VpatModel } from "@/lib/vpat-template";

export { renderVpatDocument } from "@/lib/vpat-template";
export type { VpatModel } from "@/lib/vpat-template";

type SiteRow = typeof schema.sites.$inferSelect;

/** Compute the VPAT model for a loaded site row. */
export async function vpatForSite(site: SiteRow): Promise<VpatModel> {
  const { pages } = await getSitePages(site.id, { evidence: false });
  const hasPages = pages.length > 0;
  const rules = rollupByRule(pages);
  const checklist = buildChecklist(rules, { evaluated: hasPages });
  const conformance = summarizeConformance(rules, { evaluated: hasPages });

  let lastScannedAt: Date | null = null;
  for (const p of pages) {
    const d = new Date(p.scannedAt);
    if (!lastScannedAt || d > lastScannedAt) lastScannedAt = d;
  }

  return buildVpatModel({
    siteName: site.name,
    origin: site.origin,
    config: site.statementConfig,
    conformance,
    checklist,
    generatedAt: new Date(),
    lastScannedAt,
  });
}

/** Load a site by id (owner-scoped) and build its VPAT, or null if not found/owned. */
export async function getOwnedVpat(
  siteId: string,
  userId: string,
): Promise<{ site: SiteRow; model: VpatModel } | null> {
  const rows = await db
    .select()
    .from(schema.sites)
    .where(and(eq(schema.sites.id, siteId), eq(schema.sites.ownerId, userId)))
    .limit(1);
  const site = rows[0];
  if (!site) return null;
  return { site, model: await vpatForSite(site) };
}
