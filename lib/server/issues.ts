import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";

import type { Finding, Impact, IssueStatus } from "@web-access/shared";
import { db, schema } from "./db";
import { getSitePages, rollupByRule, type RulePage, type RuleRollup } from "./report";
import { SEVERITY_ORDER, SEVERITY_RANK, emptyCounts, type Severity, type SeverityCounts } from "@/lib/severity";

/**
 * Cross-site issue model for the inbox. A "finding" is recreated on every scan, so to give owners a
 * durable, actionable unit we roll findings up to one issue per (site, rule) — the same granularity
 * as the per-site report's "by issue type" view, but spanning all of a user's sites and overlaid
 * with the lifecycle status stored in `issueOverrides`.
 *
 * issueKey = `${siteId}:${ruleId}` — stable across re-scans. A muted (resolved/ignored) issue whose
 * occurrence set later CHANGES is auto-reopened (its stored fingerprint no longer matches), so a
 * regression after a fix resurfaces instead of staying hidden.
 */

export type IssueRow = {
  key: string;
  siteId: string;
  siteName: string;
  ruleId: string;
  impact: Impact;
  message: string;
  wcag: string[];
  source: Finding["source"];
  helpUrl?: string;
  /** Offending elements across all affected pages. */
  totalSpots: number;
  /** Distinct pages (or pattern families) the rule appears on. */
  pageCount: number;
  /** Effective status after auto-reopen logic. */
  status: IssueStatus;
  /** True when a previously muted issue resurfaced because its occurrences changed. */
  reopened: boolean;
  lastSeenAt: string | null;
};

/** Stable fingerprint of an issue's current occurrences — drives auto-reopen. */
function fingerprintPages(pages: RulePage[]): string {
  const parts: string[] = [];
  for (const p of pages) {
    for (const el of p.elements) parts.push(`${p.url}|${el.selector}|${el.htmlSnippet}`);
  }
  parts.sort();
  return createHash("sha1").update(parts.join("\n")).digest("hex").slice(0, 16);
}

type EffectiveStatus = { status: IssueStatus; reopened: boolean };

/** Apply an override (if any) to an issue's current fingerprint. */
function effectiveStatus(
  override: { status: IssueStatus; fingerprint: string | null } | undefined,
  fingerprint: string,
): EffectiveStatus {
  if (!override || override.status === "open") return { status: "open", reopened: false };
  // Muted, but the occurrences changed since it was muted → resurface it.
  if (override.fingerprint && override.fingerprint !== fingerprint) {
    return { status: "open", reopened: true };
  }
  return { status: override.status, reopened: false };
}

/** The caller's sites (id + name), or just one when `siteId` is given (ownership-checked). */
async function ownedSites(userId: string, siteId?: string) {
  const where = siteId
    ? and(eq(schema.sites.ownerId, userId), eq(schema.sites.id, siteId))
    : eq(schema.sites.ownerId, userId);
  return db
    .select({ id: schema.sites.id, name: schema.sites.name })
    .from(schema.sites)
    .where(where);
}

/**
 * The set of `${siteId}:${ruleId}` an owner has opted to auto-fix going forward. An auto-fixed rule
 * reads as "fixed" everywhere (its occurrences are kept patched live by the worker), so it never
 * clogs the open inbox — even as new occurrences appear on later scans.
 */
async function autoFixRulesFor(siteIds: string[]): Promise<Set<string>> {
  if (siteIds.length === 0) return new Set();
  const rows = await db
    .select({ siteId: schema.ruleAutofix.siteId, ruleId: schema.ruleAutofix.ruleId })
    .from(schema.ruleAutofix)
    .where(and(inArray(schema.ruleAutofix.siteId, siteIds), eq(schema.ruleAutofix.enabled, true)));
  return new Set(rows.map((r) => `${r.siteId}:${r.ruleId}`));
}

async function overridesFor(siteIds: string[]) {
  if (siteIds.length === 0) return new Map<string, { status: IssueStatus; fingerprint: string | null }>();
  const rows = await db
    .select({
      siteId: schema.issueOverrides.siteId,
      issueKey: schema.issueOverrides.issueKey,
      status: schema.issueOverrides.status,
      fingerprint: schema.issueOverrides.fingerprint,
    })
    .from(schema.issueOverrides)
    .where(inArray(schema.issueOverrides.siteId, siteIds));
  const map = new Map<string, { status: IssueStatus; fingerprint: string | null }>();
  for (const r of rows) {
    map.set(r.issueKey, { status: r.status as IssueStatus, fingerprint: r.fingerprint });
  }
  return map;
}

export type IssueFilters = {
  /** "open" (default) shows open + reopened; "muted" shows resolved/ignored; "all" shows everything. */
  view?: "open" | "muted" | "all";
  severity?: Severity;
  siteId?: string;
};

/** Build the cross-site issue list for a user, with lifecycle status applied and filters honoured. */
export async function getUserIssues(userId: string, filters: IssueFilters = {}): Promise<IssueRow[]> {
  const sites = await ownedSites(userId, filters.siteId);
  if (sites.length === 0) return [];

  const overrides = await overridesFor(sites.map((s) => s.id));
  const autoFix = await autoFixRulesFor(sites.map((s) => s.id));
  const rows: IssueRow[] = [];

  for (const site of sites) {
    const { pages } = await getSitePages(site.id, { evidence: false });
    const lastSeenAt =
      pages.reduce<string | null>((max, p) => (!max || p.scannedAt > max ? p.scannedAt : max), null);
    const rollups = rollupByRule(pages);

    for (const r of rollups) {
      const key = `${site.id}:${r.ruleId}`;
      const fingerprint = fingerprintPages(r.pages);
      const eff = effectiveStatus(overrides.get(key), fingerprint);
      // An auto-fixed rule is kept patched live by the worker, so it reads as "fixed" regardless of
      // any stored override or occurrence change — it never resurfaces in the open inbox.
      const autofixed = autoFix.has(key);
      const status = autofixed ? "fixed" : eff.status;
      const reopened = autofixed ? false : eff.reopened;

      rows.push({
        key,
        siteId: site.id,
        siteName: site.name,
        ruleId: r.ruleId,
        impact: r.impact,
        message: r.message,
        wcag: r.wcag,
        source: r.source,
        totalSpots: r.totalSpots,
        pageCount: r.pageCount,
        status,
        reopened,
        lastSeenAt,
        ...(r.helpUrl ? { helpUrl: r.helpUrl } : {}),
      });
    }
  }

  const view = filters.view ?? "open";
  const filtered = rows.filter((r) => {
    if (view === "open" && r.status !== "open") return false;
    if (view === "muted" && r.status === "open") return false;
    if (filters.severity && r.impact !== filters.severity) return false;
    return true;
  });

  // Worst first: severity rank, then most occurrences.
  filtered.sort((a, b) => {
    const ra = a.impact ? SEVERITY_RANK[a.impact as Severity] : 99;
    const rb = b.impact ? SEVERITY_RANK[b.impact as Severity] : 99;
    if (ra !== rb) return ra - rb;
    return b.totalSpots - a.totalSpots;
  });
  return filtered;
}

/**
 * Open-issue aggregates for the dashboard headline, the site cards, and the sidebar critical badge —
 * deliberately computed with the SAME lifecycle logic as the Issues inbox (issueOverrides + ruleAutofix)
 * so the numbers can never disagree with the list. (They used to: the overview summed RAW findings and
 * so kept counting issues the owner had already fixed or auto-fixed — they vanished from the tab but not
 * the headline.)
 *
 *  - `counts`  — open offending-element spots by severity, for the donut / score / severity bar.
 *  - `types`   — distinct open issues (one per rule), the "N types of issues" headline number.
 *  - `pages`   — distinct pages those open issues appear on, the "across M pages" line.
 *  - `criticalTypes` — open issues at critical severity, for the "Critical" metric + sidebar badge.
 *
 * Returns the open `IssueRow[]` too, so the caller (the overview) doesn't have to re-scan the pages for
 * conformance / quick-wins.
 */
export type OpenStats = {
  counts: SeverityCounts;
  types: number;
  criticalTypes: number;
  pages: number;
};

export function emptyOpenStats(): OpenStats {
  return { counts: emptyCounts(), types: 0, criticalTypes: 0, pages: 0 };
}

export async function getOpenIssueOverview(
  userId: string,
  siteId?: string,
): Promise<{ issues: IssueRow[]; total: OpenStats; bySite: Map<string, OpenStats> }> {
  const sites = await ownedSites(userId, siteId);
  const bySite = new Map<string, OpenStats>();
  const total = emptyOpenStats();
  const totalPages = new Set<string>();
  if (sites.length === 0) return { issues: [], total, bySite };

  const overrides = await overridesFor(sites.map((s) => s.id));
  const autoFix = await autoFixRulesFor(sites.map((s) => s.id));
  const issues: IssueRow[] = [];

  for (const site of sites) {
    const { pages } = await getSitePages(site.id, { evidence: false });
    const lastSeenAt =
      pages.reduce<string | null>((max, p) => (!max || p.scannedAt > max ? p.scannedAt : max), null);
    const rollups = rollupByRule(pages);
    const stats = emptyOpenStats();
    const sitePages = new Set<string>();

    for (const r of rollups) {
      const key = `${site.id}:${r.ruleId}`;
      const fingerprint = fingerprintPages(r.pages);
      const eff = effectiveStatus(overrides.get(key), fingerprint);
      const status = autoFix.has(key) ? "fixed" : eff.status;
      if (status !== "open") continue; // fixed / muted / auto-fixed → excluded, exactly like the inbox

      issues.push({
        key,
        siteId: site.id,
        siteName: site.name,
        ruleId: r.ruleId,
        impact: r.impact,
        message: r.message,
        wcag: r.wcag,
        source: r.source,
        totalSpots: r.totalSpots,
        pageCount: r.pageCount,
        status: "open",
        reopened: autoFix.has(key) ? false : eff.reopened,
        lastSeenAt,
        ...(r.helpUrl ? { helpUrl: r.helpUrl } : {}),
      });

      stats.types += 1;
      const sev = (r.impact as Severity | null) ?? null;
      if (sev && sev in SEVERITY_RANK) {
        stats.counts[sev] += r.totalSpots;
        stats.counts.total += r.totalSpots;
        if (sev === "critical") stats.criticalTypes += 1;
      }
      // Distinct affected pages (a collapsed dynamic-route family counts as the one entry it folds to).
      for (const p of r.pages) {
        sitePages.add(p.url);
        totalPages.add(`${site.id}\n${p.url}`);
      }
    }

    stats.pages = sitePages.size;
    bySite.set(site.id, stats);
    total.types += stats.types;
    total.criticalTypes += stats.criticalTypes;
    for (const s of SEVERITY_ORDER) total.counts[s] += stats.counts[s];
    total.counts.total += stats.counts.total;
  }
  total.pages = totalPages.size;

  // Worst first, mirroring getUserIssues so QuickWins / conformance see a sensible order.
  issues.sort((a, b) => {
    const ra = a.impact ? SEVERITY_RANK[a.impact as Severity] : 99;
    const rb = b.impact ? SEVERITY_RANK[b.impact as Severity] : 99;
    if (ra !== rb) return ra - rb;
    return b.totalSpots - a.totalSpots;
  });

  return { issues, total, bySite };
}

/**
 * Which of a site's rolled-up rules are still OPEN (not fixed / auto-fixed / muted) — the SAME lifecycle
 * logic as the inbox and `getOpenIssueOverview`, but exposed for callers that already hold the rich
 * `RuleRollup[]` (the per-site report needs the full rollup with evidence/screenshots, which the lean
 * `IssueRow[]` doesn't carry). The caller is responsible for the ownership check on `siteId`.
 */
export async function openRuleIds(siteId: string, rollups: RuleRollup[]): Promise<Set<string>> {
  const overrides = await overridesFor([siteId]);
  const autoFix = await autoFixRulesFor([siteId]);
  const open = new Set<string>();
  for (const r of rollups) {
    const key = `${siteId}:${r.ruleId}`;
    if (autoFix.has(key)) continue; // auto-fixed → kept patched live → never "open"
    if (effectiveStatus(overrides.get(key), fingerprintPages(r.pages)).status === "open") {
      open.add(r.ruleId);
    }
  }
  return open;
}

export type IssueDetail = {
  key: string;
  siteId: string;
  siteName: string;
  ruleId: string;
  impact: Impact;
  message: string;
  wcag: string[];
  source: Finding["source"];
  helpUrl?: string;
  status: IssueStatus;
  reopened: boolean;
  pages: RulePage[];
};

/** Full detail for one issue (with evidence + AI explanations), or null if not found/owned. */
export async function getIssueDetail(userId: string, key: string): Promise<IssueDetail | null> {
  const sep = key.indexOf(":");
  if (sep < 0) return null;
  const siteId = key.slice(0, sep);
  const ruleId = key.slice(sep + 1);

  const sites = await ownedSites(userId, siteId);
  const site = sites[0];
  if (!site) return null;

  const { pages } = await getSitePages(siteId, { evidence: true });
  const rollup = rollupByRule(pages).find((r) => r.ruleId === ruleId);
  if (!rollup) return null;

  const overrides = await overridesFor([siteId]);
  const fingerprint = fingerprintPages(rollup.pages);
  const eff = effectiveStatus(overrides.get(key), fingerprint);
  const autofixed = (await autoFixRulesFor([siteId])).has(key);
  const status = autofixed ? "fixed" : eff.status;
  const reopened = autofixed ? false : eff.reopened;

  return {
    key,
    siteId,
    siteName: site.name,
    ruleId,
    impact: rollup.impact,
    message: rollup.message,
    wcag: rollup.wcag,
    source: rollup.source,
    status,
    reopened,
    pages: rollup.pages,
    ...(rollup.helpUrl ? { helpUrl: rollup.helpUrl } : {}),
  };
}

/** Current fingerprint for an issue (used by the mutation action when muting). Null if not found. */
export async function computeIssueFingerprint(userId: string, key: string): Promise<string | null> {
  const sep = key.indexOf(":");
  if (sep < 0) return null;
  const siteId = key.slice(0, sep);
  const ruleId = key.slice(sep + 1);

  const sites = await ownedSites(userId, siteId);
  if (!sites[0]) return null;

  const { pages } = await getSitePages(siteId, { evidence: false });
  const rollup = rollupByRule(pages).find((r) => r.ruleId === ruleId);
  return rollup ? fingerprintPages(rollup.pages) : null;
}
