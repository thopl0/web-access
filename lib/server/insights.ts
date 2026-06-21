import { desc, eq, inArray } from "drizzle-orm";

import { db, schema } from "./db";
import {
  SEVERITY_RANK,
  emptyCounts,
  type Severity,
  type SeverityCounts,
} from "@/lib/severity";
import { healthScore } from "@/lib/score";
import { explainRule } from "@/lib/explain";
import type { ScanStatus } from "@web-access/shared";

/**
 * Scan history & diff — the "is my site getting better?" surface.
 *
 * Real data only, derived from the scans + findings tables. A "snapshot" = one release (releaseId)
 * of a site: the crawl/scan run that produced a coherent point-in-time picture. Findings are
 * de-duped to issue identity (url + rule + element) so a page scanned several times in a release
 * counts its issues once — matching the report layer. The timeline is naturally empty (or has a
 * single point) until the site is re-scanned over time; the UI shows honest "need more scans"
 * states rather than inventing history.
 */

/** One point-in-time picture of a site's accessibility posture. */
export type ScanSnapshot = {
  /** Stable handle (the releaseId) used to address this snapshot in compare URLs. */
  id: string;
  label: string;
  createdAt: string; // ISO
  status: ScanStatus;
  pageCount: number;
  counts: SeverityCounts;
  /** 0–100 health score (same scale as the dashboard score badge). */
  score: number;
  /**
   * True for full-site crawls (releaseId `crawl:<jobId>`); false for single-page re-scans
   * (embed pings, in practice the homepage). Lets the UI avoid comparing across scopes.
   */
  isCrawl: boolean;
};

export type ScanTimeline = {
  siteId: string;
  /** Newest first. Empty until the site has been scanned. */
  snapshots: ScanSnapshot[];
};

export type DiffStatus = "new" | "fixed" | "regressed" | "unchanged" | "improved";

/** How one rule changed between two snapshots. */
export type DiffRule = {
  ruleId: string;
  title: string;
  impact: Severity;
  wcag: string[];
  /** Offending spots in the earlier / later snapshot. */
  before: number;
  after: number;
  status: DiffStatus;
};

export type ScanDiff = {
  from: ScanSnapshot;
  to: ScanSnapshot;
  /** Rules present in `to` but not `from`. */
  added: DiffRule[];
  /** Rules present in `from` but cleared by `to`. */
  fixed: DiffRule[];
  /** Rules in both that got worse (more spots in `to`). */
  regressed: DiffRule[];
  /** Rules in both that got better but aren't gone, plus the genuinely unchanged. */
  improved: DiffRule[];
  unchanged: DiffRule[];
};

// Internal: a snapshot plus its per-rule breakdown, the input to the pure diff.
type RuleStat = { impact: Severity; wcag: string[]; spots: number };
type SnapshotDetail = { snapshot: ScanSnapshot; rules: Map<string, RuleStat> };

function ruleTitle(ruleId: string): string {
  return explainRule(ruleId)?.title ?? ruleId;
}

function countsFromRules(rules: Map<string, RuleStat>): SeverityCounts {
  const counts = emptyCounts();
  for (const r of rules.values()) {
    counts[r.impact] += r.spots;
    counts.total += r.spots;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Real history, derived from the scans + findings tables.
// ---------------------------------------------------------------------------

type ScanRow = typeof schema.scans.$inferSelect;

async function realSnapshots(siteId: string): Promise<SnapshotDetail[]> {
  const scans = await db
    .select()
    .from(schema.scans)
    .where(eq(schema.scans.siteId, siteId))
    .orderBy(desc(schema.scans.createdAt))
    .limit(500);
  if (scans.length === 0) return [];

  // Group by release, newest-first by first appearance.
  const byRelease = new Map<string, ScanRow[]>();
  for (const s of scans) {
    const list = byRelease.get(s.releaseId);
    if (list) list.push(s);
    else byRelease.set(s.releaseId, [s]);
  }

  const findingRows = await db
    .select({
      scanId: schema.findings.scanId,
      ruleId: schema.findings.ruleId,
      wcag: schema.findings.wcag,
      impact: schema.findings.impact,
      selector: schema.findings.selector,
      htmlSnippet: schema.findings.htmlSnippet,
    })
    .from(schema.findings)
    .where(inArray(schema.findings.scanId, scans.map((s) => s.id)));
  const findingsByScan = new Map<string, typeof findingRows>();
  for (const r of findingRows) {
    const list = findingsByScan.get(r.scanId);
    if (list) list.push(r);
    else findingsByScan.set(r.scanId, [r]);
  }

  const details: SnapshotDetail[] = [];
  for (const [releaseId, group] of byRelease) {
    const urls = new Set<string>();
    const rules = new Map<string, RuleStat>();
    const seen = new Set<string>(); // url+rule+selector+snippet → one spot
    let newest: ScanRow = group[0]!;
    let anyRunning = false;
    let anyError = false;

    for (const scan of group) {
      urls.add(scan.url);
      if ((scan.completedAt ?? scan.createdAt) > (newest.completedAt ?? newest.createdAt)) newest = scan;
      if (scan.status === "running" || scan.status === "queued") anyRunning = true;
      if (scan.status === "error") anyError = true;

      for (const f of findingsByScan.get(scan.id) ?? []) {
        const sev = (f.impact ?? null) as Severity | null;
        if (!sev || !(sev in SEVERITY_RANK)) continue; // count only graded findings (matches report)
        const key = `${scan.url}\n${f.ruleId}\n${f.selector}\n${f.htmlSnippet}`;
        if (seen.has(key)) continue;
        seen.add(key);

        let stat = rules.get(f.ruleId);
        if (!stat) {
          stat = { impact: sev, wcag: f.wcag ?? [], spots: 0 };
          rules.set(f.ruleId, stat);
        }
        stat.spots += 1;
        if (SEVERITY_RANK[sev] < SEVERITY_RANK[stat.impact]) stat.impact = sev; // keep worst
      }
    }

    const counts = countsFromRules(rules);
    const pageCount = urls.size;
    const status: ScanStatus = anyError
      ? "error"
      : anyRunning
        ? "running"
        : "complete";
    details.push({
      snapshot: {
        id: releaseId,
        label: releaseLabel(releaseId, newest),
        createdAt: (newest.completedAt ?? newest.createdAt).toISOString(),
        status,
        pageCount,
        counts,
        score: healthScore(counts, pageCount),
        isCrawl: isCrawlRelease(releaseId),
      },
      rules,
    });
  }

  // Newest first.
  details.sort((a, b) => (a.snapshot.createdAt < b.snapshot.createdAt ? 1 : -1));
  return details;
}

/**
 * The single source of truth for "is this release a full-site crawl?". Crawl runs are keyed
 * `crawl:<jobId>`; everything else is a single-page re-scan (an embed ping, usually the homepage).
 */
export function isCrawlRelease(releaseId: string): boolean {
  return releaseId.startsWith("crawl:");
}

/** A friendly label for a release. Crawl runs are keyed `crawl:<jobId>`; otherwise show the id. */
function releaseLabel(releaseId: string, scan: ScanRow): string {
  if (isCrawlRelease(releaseId)) {
    const d = scan.completedAt ?? scan.createdAt;
    return `Crawl · ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  }
  return releaseId.length > 24 ? `Release ${releaseId.slice(0, 8)}` : `Release ${releaseId}`;
}

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------

/** The site's scan timeline, newest first. Real data only — empty until the site is scanned. */
export async function getScanTimeline(siteId: string): Promise<ScanTimeline> {
  const real = await realSnapshots(siteId);
  return { siteId, snapshots: real.map((d) => d.snapshot) };
}

/** Pure rule-level diff between two snapshot details (earlier `from` → later `to`). */
function diffSnapshots(from: SnapshotDetail, to: SnapshotDetail): ScanDiff {
  const added: DiffRule[] = [];
  const fixed: DiffRule[] = [];
  const regressed: DiffRule[] = [];
  const improved: DiffRule[] = [];
  const unchanged: DiffRule[] = [];

  for (const ruleId of new Set([...from.rules.keys(), ...to.rules.keys()])) {
    const a = from.rules.get(ruleId);
    const b = to.rules.get(ruleId);
    const before = a?.spots ?? 0;
    const after = b?.spots ?? 0;
    const meta = b ?? a!;
    let status: DiffStatus;
    if (!a) status = "new";
    else if (!b) status = "fixed";
    else if (after > before) status = "regressed";
    else if (after < before) status = "improved";
    else status = "unchanged";

    const row: DiffRule = {
      ruleId,
      title: ruleTitle(ruleId),
      impact: meta.impact,
      wcag: meta.wcag,
      before,
      after,
      status,
    };
    ({ new: added, fixed, regressed, improved, unchanged })[status].push(row);
  }

  const worstFirst = (x: DiffRule, y: DiffRule) =>
    SEVERITY_RANK[x.impact] - SEVERITY_RANK[y.impact] || y.after - x.after || y.before - x.before;
  for (const list of [added, fixed, regressed, improved, unchanged]) list.sort(worstFirst);

  return { from: from.snapshot, to: to.snapshot, added, fixed, regressed, improved, unchanged };
}

/**
 * Diff two real snapshots of a site (by snapshot id). Returns null if the site has fewer than two
 * snapshots or either id can't be resolved.
 */
export async function getScanDiff(
  siteId: string,
  fromId: string,
  toId: string,
): Promise<ScanDiff | null> {
  const details = await realSnapshots(siteId);
  if (details.length < 2) return null;
  const byId = new Map(details.map((d) => [d.snapshot.id, d]));

  const a = byId.get(fromId);
  const b = byId.get(toId);
  if (!a || !b) return null;

  // Order chronologically so "from → to" is always earlier → later, whatever order was requested.
  const [earlier, later] = a.snapshot.createdAt <= b.snapshot.createdAt ? [a, b] : [b, a];
  return diffSnapshots(earlier, later);
}
