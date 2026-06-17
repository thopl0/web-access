/**
 * Client-safe severity primitives. Lives outside lib/server/report.ts (which pulls
 * in the DB client) so client components can import these without dragging server
 * code into the browser bundle. report.ts re-exports these for back-compat.
 */
export const SEVERITY_ORDER = ["critical", "serious", "moderate", "minor"] as const;
export type Severity = (typeof SEVERITY_ORDER)[number];

export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
};

export type SeverityCounts = Record<Severity, number> & { total: number };

export function emptyCounts(): SeverityCounts {
  return { critical: 0, serious: 0, moderate: 0, minor: 0, total: 0 };
}
