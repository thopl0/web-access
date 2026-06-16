import { desc, eq } from "drizzle-orm";
import type { Finding, Impact, ScanReport, ScanStatus } from "@web-access/shared";
import { db, schema } from "./db";

type ScanRow = typeof schema.scans.$inferSelect;
type FindingRow = typeof schema.findings.$inferSelect;

/** Shape a scan row + its findings into the report contract returned to the dashboard. */
export function toReport(scan: ScanRow, rows: FindingRow[]): ScanReport {
  const findings: Finding[] = rows.map((r) => ({
    ruleId: r.ruleId,
    source: r.source as Finding["source"],
    tier: r.tier as Finding["tier"],
    wcag: r.wcag ?? [],
    impact: (r.impact ?? null) as Impact,
    selector: r.selector,
    htmlSnippet: r.htmlSnippet,
    message: r.message,
    ...(r.helpUrl ? { helpUrl: r.helpUrl } : {}),
  }));
  return {
    scanId: scan.id,
    siteId: scan.siteId,
    url: scan.url,
    releaseId: scan.releaseId,
    templateFingerprint: scan.templateFingerprint,
    status: scan.status as ScanStatus,
    createdAt: scan.createdAt.toISOString(),
    completedAt: scan.completedAt ? scan.completedAt.toISOString() : null,
    findings,
    ...(scan.error ? { error: scan.error } : {}),
  };
}

/** Latest scans (with findings) for a site — the dashboard report surface. Callable directly from
 *  server components, so the UI never has to round-trip through HTTP. */
export async function getSiteReport(
  siteId: string,
): Promise<{ siteId: string; scans: ScanReport[] }> {
  const scans = await db
    .select()
    .from(schema.scans)
    .where(eq(schema.scans.siteId, siteId))
    .orderBy(desc(schema.scans.createdAt))
    .limit(50);

  const reports: ScanReport[] = [];
  for (const scan of scans) {
    const rows = await db
      .select()
      .from(schema.findings)
      .where(eq(schema.findings.scanId, scan.id));
    reports.push(toReport(scan, rows));
  }
  return { siteId, scans: reports };
}
