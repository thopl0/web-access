import "server-only";

import { and, eq } from "drizzle-orm";

import { db, schema } from "./db";
import { getSitePages, rollupByRule } from "./report";
import { buildChecklist, summarizeConformance } from "@/lib/wcag";
import { buildStatementModel, type StatementModel } from "@/lib/statement-template";

// The pure model/rendering logic lives in lib/statement-template.ts (client-safe + unit tested).
// This module is the server-only wiring: load a site + its latest scan and compute its statement.
export {
  buildStatementModel,
  statementBodyHtml,
  renderStatementDocument,
} from "@/lib/statement-template";
export type {
  StatementModel,
  StatementFailing,
  ConformanceStatus,
} from "@/lib/statement-template";

type SiteRow = typeof schema.sites.$inferSelect;

/** Compute the statement model for a loaded site row (shared by the owner view and the public one). */
export async function statementForSite(site: SiteRow): Promise<StatementModel> {
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

  let ownerEmail: string | null = null;
  if (site.ownerId) {
    const owner = await db
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, site.ownerId))
      .limit(1);
    ownerEmail = owner[0]?.email ?? null;
  }

  return buildStatementModel({
    siteName: site.name,
    origin: site.origin,
    config: site.statementConfig,
    conformance,
    checklist,
    ownerEmail,
    generatedAt: new Date(),
    lastScannedAt,
  });
}

/** Load a site by id (owner-scoped) and build its statement, or null if not found/owned. */
export async function getOwnedStatement(
  siteId: string,
  userId: string,
): Promise<{ site: SiteRow; model: StatementModel } | null> {
  const rows = await db
    .select()
    .from(schema.sites)
    .where(and(eq(schema.sites.id, siteId), eq(schema.sites.ownerId, userId)))
    .limit(1);
  const site = rows[0];
  if (!site) return null;
  return { site, model: await statementForSite(site) };
}

/** Load a published statement by its public token, or null. */
export async function getPublishedStatement(
  token: string,
): Promise<{ site: SiteRow; model: StatementModel } | null> {
  const rows = await db
    .select()
    .from(schema.sites)
    .where(eq(schema.sites.statementToken, token))
    .limit(1);
  const site = rows[0];
  if (!site) return null;
  return { site, model: await statementForSite(site) };
}
