import "server-only";

import { and, eq } from "drizzle-orm";

import { db, schema } from "./db";
import { getSitePages, rollupByRule } from "./report";
import { buildChecklist, summarizeConformance } from "@/lib/wcag";
import { buildCertificateModel, type CertificateModel } from "@/lib/certificate-template";

export { renderCertificateDocument } from "@/lib/certificate-template";
export type { CertificateModel } from "@/lib/certificate-template";

type SiteRow = typeof schema.sites.$inferSelect;

/** Compute the conformance certificate model for a loaded site row. */
export async function certificateForSite(site: SiteRow): Promise<CertificateModel> {
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

  return buildCertificateModel({
    siteName: site.name,
    origin: site.origin,
    config: site.statementConfig,
    conformance,
    checklist,
    pageCount: pages.length,
    generatedAt: new Date(),
    lastScannedAt,
  });
}

/** Load a site by id (owner-scoped) and build its certificate, or null if not found/owned. */
export async function getOwnedCertificate(
  siteId: string,
  userId: string,
): Promise<{ site: SiteRow; model: CertificateModel } | null> {
  const rows = await db
    .select()
    .from(schema.sites)
    .where(and(eq(schema.sites.id, siteId), eq(schema.sites.ownerId, userId)))
    .limit(1);
  const site = rows[0];
  if (!site) return null;
  return { site, model: await certificateForSite(site) };
}
