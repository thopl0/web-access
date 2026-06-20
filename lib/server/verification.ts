import { and, desc, eq, inArray } from "drizzle-orm";

import type { Finding, Impact } from "@web-access/shared";
import { db, schema } from "./db";
import {
  getSitePages,
  rollupByRule,
  type IssueElement,
  type IssueGroup,
  type PageReport,
} from "./report";
import type { Severity } from "@/lib/severity";
import { emptyCounts, SEVERITY_RANK } from "@/lib/severity";

type ScanRow = typeof schema.scans.$inferSelect;
type FindingRow = typeof schema.findings.$inferSelect;

/**
 * Scan-to-scan verification (plan §8.5). A "finding" is recreated on every scan, so the durable unit
 * is an ISSUE = one (site, rule). Rule resolution is SITE-WIDE — a rule is "resolved" only once ALL its
 * occurrences across every page are gone — so verification lives here at the aggregation layer (over
 * `getSitePages` + `rollupByRule`), never in the per-URL worker.
 *
 * We compare the CURRENT site-wide rule set (latest completed scan per URL, exactly what the dashboard
 * shows) against the PREVIOUS one (the second-latest completed scan per URL). A rule present in the
 * previous set and absent from the current set is a VERIFIED fix: the re-scan confirms the problem is
 * actually gone. Enrichment then says how strong that signal is — whether a fix had been suggested for
 * it, and whether the owner had already marked it resolved/ignored.
 */

/** A site-wide rule occurrence, as a comparable snapshot entry. Pure data — diffed without a DB. */
export interface RuleSnapshot {
  ruleId: string;
  message: string;
  impact: Impact;
  wcag: string[];
  /** Total offending elements across every page (mirrors RuleRollup.totalSpots). */
  spots: number;
  /** Distinct pages the rule appears on. */
  pageCount: number;
}

/** One rule that changed between scans, carried to the UI with verification context. */
export interface RuleDelta {
  ruleId: string;
  message: string;
  impact: Impact;
  wcag: string[];
  spots: number;
  pageCount: number;
  /** The previous scan had a stored before→after fix for this rule (so we can say "the fix worked"). */
  hadSuggestedFix: boolean;
  /** The owner had explicitly resolved/ignored this issue (the strongest "verified fixed" signal). */
  ownerMarkedResolved: boolean;
}

/** The verification delta between the previous and the current site-wide scan state. */
export interface ScanDelta {
  /** Rules present last scan and gone now — the verified fixes. */
  resolved: RuleDelta[];
  /** Rules present now and absent last scan — regressions / newly introduced. */
  introduced: RuleDelta[];
  /** Rules present in both scans (still outstanding). */
  persistingRuleCount: number;
  /** Time of the latest scan used for the current snapshot. */
  comparedAt: string | null;
  /** Time of the scan used for the previous snapshot. */
  previousAt: string | null;
  /** False when no URL has a previous completed scan yet — nothing to verify. */
  hasPrevious: boolean;
}

/**
 * Pure set diff over site-wide rule snapshots, matched by ruleId. Unit-tested without a DB.
 *   resolved   = in `previous`, not in `current`  (fixed/verified)
 *   introduced = in `current`, not in `previous`  (regressions / new)
 *   persisting = in both
 * The CURRENT entry is preferred for `introduced`/`persisting` (latest message/impact/counts); the
 * PREVIOUS entry is preferred for `resolved` (it no longer exists in current).
 */
export function diffRuleSnapshots(
  previous: RuleSnapshot[],
  current: RuleSnapshot[],
): { resolved: RuleSnapshot[]; introduced: RuleSnapshot[]; persisting: RuleSnapshot[] } {
  const prevByRule = new Map<string, RuleSnapshot>();
  for (const r of previous) prevByRule.set(r.ruleId, r);
  const currByRule = new Map<string, RuleSnapshot>();
  for (const r of current) currByRule.set(r.ruleId, r);

  const resolved: RuleSnapshot[] = [];
  for (const r of previous) {
    if (!currByRule.has(r.ruleId)) resolved.push(r);
  }

  const introduced: RuleSnapshot[] = [];
  const persisting: RuleSnapshot[] = [];
  for (const r of current) {
    if (prevByRule.has(r.ruleId)) persisting.push(r);
    else introduced.push(r);
  }

  return { resolved, introduced, persisting };
}

/** Order the same way the report does: worst severity first, then most spots. */
function severityRank(impact: Impact): number {
  return impact ? SEVERITY_RANK[impact as Severity] : 99;
}

/** A RuleRollup → comparable snapshot entry. */
function snapshotFromRollup(r: {
  ruleId: string;
  message: string;
  impact: Impact;
  wcag: string[];
  totalSpots: number;
  pageCount: number;
}): RuleSnapshot {
  return {
    ruleId: r.ruleId,
    message: r.message,
    impact: r.impact,
    wcag: r.wcag,
    spots: r.totalSpots,
    pageCount: r.pageCount,
  };
}

/**
 * Build the PREVIOUS site-wide page report: one PageReport per concrete url, populated from that url's
 * SECOND-latest completed scan (the state before the most recent re-scan). Mirrors getSitePages' scan
 * query + grouping, but deliberately skips the pattern-family collapsing and evidence joins — the only
 * consumer is `rollupByRule`, which aggregates by ruleId site-wide, so per-rule spots/pageCount stay
 * comparable to the current snapshot while matching is purely by ruleId.
 *
 * A url with only ONE completed scan contributes nothing (no false "resolved"). Returns the previous
 * pages, the previous scan ids used (so the resolved-fix enrichment can reuse them without re-querying),
 * and the newest previous-scan time used (for `previousAt`).
 */
async function getPreviousPages(
  siteId: string,
): Promise<{ pages: PageReport[]; previousIds: string[]; previousAt: Date | null }> {
  // Newest first, so per url the completed scans appear latest → oldest.
  const scans = await db
    .select()
    .from(schema.scans)
    .where(eq(schema.scans.siteId, siteId))
    .orderBy(desc(schema.scans.createdAt))
    .limit(500);

  // Per url, the SECOND completed scan (index 1 among completed, newest-first) is the previous state.
  const previousByUrl = new Map<string, ScanRow>();
  const completedSeen = new Map<string, number>();
  for (const scan of scans) {
    if (scan.status !== "complete") continue;
    const count = completedSeen.get(scan.url) ?? 0;
    if (count === 1) previousByUrl.set(scan.url, scan); // the second completed we hit
    completedSeen.set(scan.url, count + 1);
  }

  if (previousByUrl.size === 0) return { pages: [], previousIds: [], previousAt: null };

  const previousScans = [...previousByUrl.values()];
  const previousIds = previousScans.map((s) => s.id);
  let previousAt: Date | null = null;
  for (const s of previousScans) {
    if (!previousAt || s.createdAt > previousAt) previousAt = s.createdAt;
  }

  const findingRows = await db
    .select()
    .from(schema.findings)
    .where(inArray(schema.findings.scanId, previousIds));
  const findingsByScan = new Map<string, FindingRow[]>();
  for (const row of findingRows) {
    const list = findingsByScan.get(row.scanId);
    if (list) list.push(row);
    else findingsByScan.set(row.scanId, [row]);
  }

  const pages: PageReport[] = [];
  for (const scan of previousScans) {
    const groupMap = new Map<string, IssueGroup>();
    const elemByKey = new Map<string, Map<string, IssueElement>>(); // ruleId → (selector\nsnippet → el)
    const counts = emptyCounts();

    for (const r of findingsByScan.get(scan.id) ?? []) {
      let group = groupMap.get(r.ruleId);
      if (!group) {
        group = {
          ruleId: r.ruleId,
          impact: (r.impact ?? null) as Impact,
          message: r.message,
          wcag: r.wcag ?? [],
          source: r.source as Finding["source"],
          elements: [],
          ...(r.helpUrl ? { helpUrl: r.helpUrl } : {}),
        };
        groupMap.set(r.ruleId, group);
        elemByKey.set(r.ruleId, new Map());
      }

      const byKey = elemByKey.get(r.ruleId)!;
      const key = `${r.selector}\n${r.htmlSnippet}`;
      if (byKey.has(key)) continue; // de-dupe identical element under the same rule
      const el: IssueElement = { selector: r.selector, htmlSnippet: r.htmlSnippet };
      byKey.set(key, el);
      group.elements.push(el);

      const sev = (r.impact as Severity | null) ?? null;
      if (sev && sev in SEVERITY_RANK) {
        counts[sev] += 1;
        counts.total += 1;
      }
    }

    pages.push({
      url: scan.url,
      grouped: false,
      pageCount: 1,
      status: "complete",
      scannedAt: scan.createdAt.toISOString(),
      totalScans: 1,
      pending: 0,
      counts,
      groups: [...groupMap.values()],
    });
  }

  return { pages, previousIds, previousAt };
}

/**
 * The verification delta for a site: what the latest re-scan CONFIRMS was fixed, what regressed, and
 * how much still persists. Never throws on a site with no scans (returns an empty, hasPrevious:false
 * delta). The "previous" state is the second-latest completed scan per url; if no url has one, there is
 * nothing to verify yet.
 */
export async function getScanDelta(siteId: string): Promise<ScanDelta> {
  // CURRENT snapshot — exactly the dashboard's site-wide rollup (latest completed scan per url).
  const { pages: currentPages } = await getSitePages(siteId, { evidence: false });
  const currentRollups = rollupByRule(currentPages);
  const currentSnapshot = currentRollups.map(snapshotFromRollup);
  const comparedAt =
    currentPages.reduce<string | null>(
      (max, p) => (!max || p.scannedAt > max ? p.scannedAt : max),
      null,
    ) ?? null;

  // PREVIOUS snapshot — second-latest completed scan per url.
  const { pages: previousPages, previousIds, previousAt } = await getPreviousPages(siteId);
  if (previousPages.length === 0) {
    return {
      resolved: [],
      introduced: [],
      persistingRuleCount: 0,
      comparedAt,
      previousAt: null,
      hasPrevious: false,
    };
  }
  const previousRollups = rollupByRule(previousPages);
  const previousSnapshot = previousRollups.map(snapshotFromRollup);

  const { resolved, introduced, persisting } = diffRuleSnapshots(previousSnapshot, currentSnapshot);

  // Enrich the resolved (verified) rules: did a fix get suggested for them last scan, and had the owner
  // marked them resolved/ignored? Both let the UI say "the fix you applied worked / verified".
  const resolvedRuleIds = new Set(resolved.map((r) => r.ruleId));
  const [withFix, ownerResolved] = await Promise.all([
    previousFindingRulesWithFix(previousIds, resolvedRuleIds),
    ownerResolvedRules(siteId, resolvedRuleIds),
  ]);

  const toDelta = (s: RuleSnapshot, hadSuggestedFix: boolean, ownerMarkedResolved: boolean): RuleDelta => ({
    ruleId: s.ruleId,
    message: s.message,
    impact: s.impact,
    wcag: s.wcag,
    spots: s.spots,
    pageCount: s.pageCount,
    hadSuggestedFix,
    ownerMarkedResolved,
  });

  const resolvedDeltas = resolved
    .map((s) => toDelta(s, withFix.has(s.ruleId), ownerResolved.has(s.ruleId)))
    .sort((a, b) => severityRank(a.impact) - severityRank(b.impact) || b.spots - a.spots);

  // Introduced rules carry no positive fix signal (they're new/regressed) — both flags are false.
  const introducedDeltas = introduced
    .map((s) => toDelta(s, false, false))
    .sort((a, b) => severityRank(a.impact) - severityRank(b.impact) || b.spots - a.spots);

  return {
    resolved: resolvedDeltas,
    introduced: introducedDeltas,
    persistingRuleCount: persisting.length,
    comparedAt,
    previousAt: previousAt ? previousAt.toISOString() : null,
    hasPrevious: true,
  };
}

/**
 * Which of `ruleIds` had a stored before→after fix in the PREVIOUS completed scan per url (the
 * `previousIds` already derived by `getPreviousPages`). Checks whether any of those scans' findings for
 * the resolved rules carries a `fixSuggestions` row. A hit means we can tell the owner "the fix you
 * applied worked", not merely "this is gone".
 */
async function previousFindingRulesWithFix(
  previousIds: string[],
  ruleIds: Set<string>,
): Promise<Set<string>> {
  if (ruleIds.size === 0 || previousIds.length === 0) return new Set();

  // Findings (id + ruleId) on those previous scans, limited to the resolved rules.
  const findingRows = await db
    .select({ id: schema.findings.id, ruleId: schema.findings.ruleId })
    .from(schema.findings)
    .where(inArray(schema.findings.scanId, previousIds));
  const ruleByFinding = new Map<number, string>();
  for (const f of findingRows) {
    if (ruleIds.has(f.ruleId)) ruleByFinding.set(f.id, f.ruleId);
  }
  if (ruleByFinding.size === 0) return new Set();

  const fixRows = await db
    .select({ findingId: schema.fixSuggestions.findingId })
    .from(schema.fixSuggestions)
    .where(inArray(schema.fixSuggestions.findingId, [...ruleByFinding.keys()]));

  const withFix = new Set<string>();
  for (const f of fixRows) {
    const rule = ruleByFinding.get(f.findingId);
    if (rule) withFix.add(rule);
  }
  return withFix;
}

/** Which of `ruleIds` the owner had explicitly muted (resolved/ignored) via an issueOverrides row keyed
 *  "siteId:ruleId". The strongest "verified fixed" signal when the rule is now gone. */
async function ownerResolvedRules(siteId: string, ruleIds: Set<string>): Promise<Set<string>> {
  if (ruleIds.size === 0) return new Set();

  const keys = [...ruleIds].map((ruleId) => `${siteId}:${ruleId}`);
  const rows = await db
    .select({ issueKey: schema.issueOverrides.issueKey, status: schema.issueOverrides.status })
    .from(schema.issueOverrides)
    .where(
      and(eq(schema.issueOverrides.siteId, siteId), inArray(schema.issueOverrides.issueKey, keys)),
    );

  const resolvedKeys = new Set<string>();
  for (const r of rows) {
    if (r.status === "resolved" || r.status === "ignored") {
      // issueKey is "siteId:ruleId"; recover ruleId after the first ":".
      const sep = r.issueKey.indexOf(":");
      if (sep >= 0) resolvedKeys.add(r.issueKey.slice(sep + 1));
    }
  }
  return resolvedKeys;
}
