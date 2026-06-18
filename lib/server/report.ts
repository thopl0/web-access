import { cache } from "react";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import type { AttributePatch, Finding, Impact, ScanReport, ScanStatus } from "@web-access/shared";
import { db, schema } from "./db";
import { SEVERITY_RANK, emptyCounts } from "@/lib/severity";
import type { Severity, SeverityCounts } from "@/lib/severity";

// Re-exported so existing importers of these from report.ts keep working; the
// definitions now live in the client-safe lib/severity.ts.
export { SEVERITY_ORDER } from "@/lib/severity";
export type { Severity, SeverityCounts } from "@/lib/severity";

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

// ---------------------------------------------------------------------------
// Grouped "by page" view for the dashboard.
//
// A site accumulates many scans of the SAME url (each release/template combo is
// its own scan, and in dev every HMR reload looks like a new release). On top of
// that, dynamic routes (e.g. /promo/<ulid>) produce a DISTINCT url — and usually
// a distinct template fingerprint — for every instance, so the same design shows
// up as dozens of separate pages. The flat scan list is unreadable, so here we:
//   1. collapse to one entry per concrete url (latest completed scan wins), then
//   2. collapse concrete urls into a "pattern family" (/promo/:id) so dynamic
//      routes read as a single page card.
// We do NOT drop the extra instances' findings — dynamic content is a blind spot
// we still scan — so the family card AGGREGATES findings across every instance,
// de-duping identical ones while remembering which pages each appears on.
// ---------------------------------------------------------------------------

/**
 * Is this path segment an opaque, machine-generated id (vs a stable, human route
 * like "promo" or "pricing")? We only collapse segments we're confident are ids,
 * to avoid merging genuinely different routes. Human-readable slugs (which carry
 * separators, e.g. "black-friday-2024") are deliberately left alone.
 */
function isDynamicSegment(seg: string): boolean {
  if (!seg) return false;
  // ULID — Crockford base32, 26 chars (e.g. 01KV5QATWN4HZXNSHMFF49GR50).
  if (/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(seg)) return true;
  // UUID.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return true;
  // Pure numeric id (e.g. /orders/48213).
  if (/^\d+$/.test(seg)) return true;
  // Long hex digest (e.g. sha/content hash).
  if (/^[0-9a-f]{16,}$/i.test(seg)) return true;
  // Opaque token: long, no separators, mixes letters and digits (nanoid/base62-ish).
  // Excluding separators keeps hyphenated slugs out.
  if (seg.length >= 16 && /^[A-Za-z0-9]+$/.test(seg) && /[A-Za-z]/.test(seg) && /\d/.test(seg)) {
    return true;
  }
  return false;
}

/** Collapse a concrete url's dynamic path segments to `:id` so instances of the same
 *  dynamic route share one pattern. Origin and static segments are preserved. */
export function urlPattern(rawUrl: string): string {
  let origin = "";
  let path = rawUrl;
  try {
    const u = new URL(rawUrl);
    origin = u.origin;
    path = u.pathname; // embed posts origin+pathname only — no query/hash to worry about
  } catch {
    // Not an absolute url — treat the whole thing as a path.
  }
  const pattern = path
    .split("/")
    .map((seg) => (isDynamicSegment(seg) ? ":id" : seg))
    .join("/");
  return origin + pattern;
}

/** AI-written, element-specific explanation (Tier-3). Optional — absent when AI is unconfigured,
 *  over the per-scan cap, or the model failed; the UI then shows the rule's generic message. */
export type ElementExplanation = {
  title?: string;
  what: string;
  fix: string;
};

/** A concrete before→after code fix for an element (the product's differentiator). `kind` is
 *  "deterministic" (a safe mechanical transform) or "ai" (a GLM-suggested judgment call, always
 *  flagged needsReview). Optional — absent when no mechanical fix applies, AI is unconfigured/over the
 *  per-scan cap, or the model missed. Mirrors how `explanation` is loaded from its own table. */
export type ElementFix = {
  kind: "deterministic" | "ai";
  /** Original element markup. */
  before: string;
  /** Corrected element markup the owner can paste in. */
  after: string;
  /** True when a human must confirm the result (all AI fixes, or an inserted placeholder). */
  needsReview: boolean;
  /** What still needs a human decision, when anything does. */
  note?: string;
  /** Structured safe-attribute form of this fix (Phase C). Present => eligible to apply as a live fix. */
  attributePatch?: AttributePatch[];
};

/** Where an element sits on the page, in the full-page screenshot's coordinate space (CSS px).
 *  Drawn as a highlight box over the page's `shot`. */
export type ElementBox = { x: number; y: number; w: number; h: number };

/** One affected element under a rule. `screenshot`, when present, is the URL of the cropped element
 *  image — served (access-controlled) by `/api/evidence/[findingId]`, with `?token=` on shared views. */
export type IssueElement = {
  selector: string;
  htmlSnippet: string;
  screenshot?: string;
  width?: number;
  height?: number;
  /** Document-relative box, for highlighting this element on the page's full-page screenshot. */
  box?: ElementBox;
  /** Plain-language, element-specific "what's wrong / how to fix", written by the AI judge. */
  explanation?: ElementExplanation;
  /** Concrete before→after code fix for this element, when one could be generated. */
  fix?: ElementFix;
  /** Concrete page urls this element was found on. Only set when the card collapses
   *  multiple pages (a pattern family), so instance-specific issues stay traceable. */
  urls?: string[];
};

/** A downscaled full-page screenshot for a page — the canvas element highlights overlay onto.
 *  `src` is the image URL, served (access-controlled) by `/api/shot/[scanId]` (with `?token=` on
 *  shared views). `width`/`height` are the document's CSS-px dimensions so boxes map on as fractions. */
export type PageShot = { src: string; width: number; height: number };

/** Findings for a single rule on a page, with every element it affects. */
export type IssueGroup = {
  ruleId: string;
  impact: Impact;
  message: string;
  wcag: string[];
  source: Finding["source"];
  helpUrl?: string;
  elements: IssueElement[];
};

export type PageReport = {
  /** Display key: the concrete url for a single page, or the collapsed pattern (e.g. /promo/:id). */
  url: string;
  /** True when this card collapses multiple concrete pages of one dynamic route. */
  grouped: boolean;
  /** Number of distinct concrete page urls folded into this card (1 when not grouped). */
  pageCount: number;
  status: ScanStatus;
  scannedAt: string;
  /** Total scans recorded across this card's page(s) (across releases/reloads). */
  totalScans: number;
  /** Scans across this card's page(s) still queued or running. */
  pending: number;
  error?: string;
  counts: SeverityCounts;
  groups: IssueGroup[];
  /** Full-page screenshot of the displayed scan, if captured — element boxes overlay onto it. */
  shot?: PageShot;
};

export type SitePages = {
  siteId: string;
  pages: PageReport[];
  counts: SeverityCounts;
};

/** Strip the origin so a page path reads clearly (keep query). Falls back to the raw url. */
export function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search || "/";
  } catch {
    return url;
  }
}

/** One page on which a rule was found, with the offending elements there. */
export type RulePage = {
  path: string;
  url: string;
  /** True when this "page" is a collapsed dynamic-route family (e.g. /promo/:id). */
  grouped: boolean;
  /** Concrete pages folded into this entry (1 when not grouped). */
  pageCount: number;
  elements: IssueElement[];
  /** Full-page screenshot of the displayed scan, if captured — element boxes overlay onto it. */
  shot?: PageShot;
};

/** A single rule rolled up across the whole site — the "by issue type" view. The
 *  same problem (e.g. color-contrast) usually recurs on many pages; this collapses
 *  those repeats into one actionable entry while keeping per-page provenance. */
export type RuleRollup = {
  ruleId: string;
  impact: Impact;
  message: string;
  wcag: string[];
  source: Finding["source"];
  helpUrl?: string;
  /** Total offending elements across every page. */
  totalSpots: number;
  /** Distinct pages the rule appears on. */
  pageCount: number;
  pages: RulePage[];
};

/** Transform the per-page report into a per-rule rollup. Pure — no DB access — so it
 *  reuses the already-fetched page data. Sorted worst-severity, then most spots. */
export function rollupByRule(pages: PageReport[]): RuleRollup[] {
  const byRule = new Map<string, RuleRollup>();

  for (const page of pages) {
    const path = pathOf(page.url);
    for (const g of page.groups) {
      let rollup = byRule.get(g.ruleId);
      if (!rollup) {
        rollup = {
          ruleId: g.ruleId,
          impact: g.impact,
          message: g.message,
          wcag: g.wcag,
          source: g.source,
          totalSpots: 0,
          pageCount: 0,
          pages: [],
          ...(g.helpUrl ? { helpUrl: g.helpUrl } : {}),
        };
        byRule.set(g.ruleId, rollup);
      }
      // Keep the worst impact seen for the rule (defensive — usually consistent).
      if (
        g.impact &&
        (!rollup.impact || SEVERITY_RANK[g.impact as Severity] < SEVERITY_RANK[rollup.impact as Severity])
      ) {
        rollup.impact = g.impact;
      }
      rollup.pages.push({
        path,
        url: page.url,
        grouped: page.grouped,
        pageCount: page.pageCount,
        elements: g.elements,
        ...(page.shot ? { shot: page.shot } : {}),
      });
      rollup.totalSpots += g.elements.length;
      rollup.pageCount += 1;
    }
  }

  const rollups = [...byRule.values()];
  for (const r of rollups) r.pages.sort((a, b) => a.path.localeCompare(b.path));
  rollups.sort((a, b) => {
    const ra = a.impact ? SEVERITY_RANK[a.impact as Severity] : 99;
    const rb = b.impact ? SEVERITY_RANK[b.impact as Severity] : 99;
    if (ra !== rb) return ra - rb;
    return b.totalSpots - a.totalSpots;
  });
  return rollups;
}

/** Pick the scan we should show for a url: latest completed, else latest of any status. */
function pickShown(scans: ScanRow[]): ScanRow {
  return scans.find((s) => s.status === "complete") ?? scans[0];
}

export async function getSitePages(
  siteId: string,
  opts: { evidence?: boolean; shareToken?: string } = {},
): Promise<SitePages> {
  // The list view only needs counts, so it opts out of the evidence join. The detail view keeps it
  // (default) to emit element screenshot URLs.
  const withEvidence = opts.evidence ?? true;
  // Image URLs are access-controlled; on a public share view we carry the site's share token so the
  // image routes authorize the anonymous viewer. Authed (owner) views pass no token.
  const tokenQuery = opts.shareToken ? `?token=${encodeURIComponent(opts.shareToken)}` : "";
  // Newest first so the first match per url is the latest, and the first
  // "complete" we hit is the latest completed.
  const scans = await db
    .select()
    .from(schema.scans)
    .where(eq(schema.scans.siteId, siteId))
    .orderBy(desc(schema.scans.createdAt))
    .limit(500);

  // Group scan rows by url, preserving newest-first order.
  const byUrl = new Map<string, ScanRow[]>();
  for (const scan of scans) {
    const list = byUrl.get(scan.url);
    if (list) list.push(scan);
    else byUrl.set(scan.url, [scan]);
  }

  // Findings only for the scans we actually display.
  const shownByUrl = new Map<string, ScanRow>();
  for (const [url, list] of byUrl) shownByUrl.set(url, pickShown(list));
  const shownIds = [...shownByUrl.values()].map((s) => s.id);

  const findingRows = shownIds.length
    ? await db.select().from(schema.findings).where(inArray(schema.findings.scanId, shownIds))
    : [];
  const findingsByScan = new Map<string, FindingRow[]>();
  for (const row of findingRows) {
    const list = findingsByScan.get(row.scanId);
    if (list) list.push(row);
    else findingsByScan.set(row.scanId, [row]);
  }

  // Cropped screenshots for those findings (separate table so the heavy column is opt-in).
  const findingIds = findingRows.map((r) => r.id);
  const evidenceRows =
    withEvidence && findingIds.length
      ? await db
          .select()
          .from(schema.evidence)
          .where(inArray(schema.evidence.findingId, findingIds))
      : [];
  const evidenceByFinding = new Map<number, (typeof evidenceRows)[number]>();
  for (const e of evidenceRows) evidenceByFinding.set(e.findingId, e);

  // Full-page screenshots for the displayed scans (separate table, opt-in with evidence). Used to
  // highlight WHERE each element sits on the page.
  const shotRows =
    withEvidence && shownIds.length
      ? await db.select().from(schema.scanShots).where(inArray(schema.scanShots.scanId, shownIds))
      : [];
  const shotByScan = new Map<string, PageShot>();
  for (const s of shotRows)
    shotByScan.set(s.scanId, { src: `/api/shot/${s.scanId}${tokenQuery}`, width: s.width, height: s.height });

  // AI explanations for those findings (separate table, opt-in with evidence — only the detail
  // view needs them; the list/summary view passes evidence:false and skips this join too).
  const explanationRows =
    withEvidence && findingIds.length
      ? await db
          .select()
          .from(schema.findingExplanations)
          .where(inArray(schema.findingExplanations.findingId, findingIds))
      : [];
  const explanationByFinding = new Map<number, (typeof explanationRows)[number]>();
  for (const e of explanationRows) explanationByFinding.set(e.findingId, e);

  // Concrete before→after fixes for those findings (separate table, opt-in with evidence — same as
  // explanations; the list/summary view skips this join). Attached to the element as `fix`.
  const fixRows =
    withEvidence && findingIds.length
      ? await db
          .select()
          .from(schema.fixSuggestions)
          .where(inArray(schema.fixSuggestions.findingId, findingIds))
      : [];
  const fixByFinding = new Map<number, (typeof fixRows)[number]>();
  for (const f of fixRows) fixByFinding.set(f.findingId, f);

  // Fold concrete urls into pattern families (/promo/<ulid> → /promo/:id), keeping the
  // newest-first order of their first occurrence.
  const urlsByPattern = new Map<string, string[]>();
  for (const url of byUrl.keys()) {
    const pattern = urlPattern(url);
    const list = urlsByPattern.get(pattern);
    if (list) list.push(url);
    else urlsByPattern.set(pattern, [url]);
  }

  const siteCounts = emptyCounts();
  const pages: PageReport[] = [];

  for (const [pattern, urls] of urlsByPattern) {
    const grouped = urls.length > 1;

    // Aggregate findings across every concrete page in the family. De-dupe identical
    // (rule + element) findings, but remember which pages each one showed up on so an
    // issue that only exists on one dynamic instance still surfaces.
    const groupMap = new Map<string, IssueGroup>();
    const elemByKey = new Map<string, Map<string, IssueElement>>(); // ruleId → (selector\nsnippet → element)
    const elemUrls = new Map<IssueElement, Set<string>>();
    const counts = emptyCounts();

    let totalScans = 0;
    let pending = 0;
    let shown: ScanRow | undefined; // newest displayed scan across the family

    for (const url of urls) {
      const scansForUrl = byUrl.get(url)!;
      totalScans += scansForUrl.length;
      pending += scansForUrl.filter((s) => s.status === "queued" || s.status === "running").length;

      const urlShown = shownByUrl.get(url)!;
      if (!shown || urlShown.createdAt > shown.createdAt) shown = urlShown;

      for (const r of findingsByScan.get(urlShown.id) ?? []) {
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
        let el = byKey.get(key);
        if (!el) {
          // First time we see this exact element under this rule — count it once.
          const sev = (r.impact as Severity | null) ?? null;
          if (sev && sev in SEVERITY_RANK) {
            counts[sev] += 1;
            counts.total += 1;
            siteCounts[sev] += 1;
            siteCounts.total += 1;
          }
          const ev = evidenceByFinding.get(r.id);
          const expl = explanationByFinding.get(r.id);
          const fixRow = fixByFinding.get(r.id);
          el = {
            selector: r.selector,
            htmlSnippet: r.htmlSnippet,
            ...(ev
              ? {
                  screenshot: `/api/evidence/${r.id}${tokenQuery}`,
                  ...(ev.width != null ? { width: ev.width } : {}),
                  ...(ev.height != null ? { height: ev.height } : {}),
                  ...(ev.pageX != null && ev.pageY != null && ev.width != null && ev.height != null
                    ? { box: { x: ev.pageX, y: ev.pageY, w: ev.width, h: ev.height } }
                    : {}),
                }
              : {}),
            ...(expl
              ? {
                  explanation: {
                    ...(expl.title ? { title: expl.title } : {}),
                    what: expl.what,
                    fix: expl.fix,
                  },
                }
              : {}),
            ...(fixRow
              ? {
                  fix: {
                    kind: fixRow.kind as ElementFix["kind"],
                    before: fixRow.before,
                    after: fixRow.after,
                    needsReview: fixRow.needsReview,
                    ...(fixRow.note ? { note: fixRow.note } : {}),
                    ...(fixRow.attributePatch && fixRow.attributePatch.length
                      ? { attributePatch: fixRow.attributePatch }
                      : {}),
                  },
                }
              : {}),
          };
          byKey.set(key, el);
          group.elements.push(el);
          elemUrls.set(el, new Set());
        }
        elemUrls.get(el)!.add(url);
      }
    }

    // Annotate provenance only for collapsed cards — a single page doesn't need it.
    if (grouped) {
      for (const [el, set] of elemUrls) el.urls = [...set].sort();
    }

    const groups = [...groupMap.values()].sort((a, b) => {
      const ra = a.impact ? SEVERITY_RANK[a.impact as Severity] : 99;
      const rb = b.impact ? SEVERITY_RANK[b.impact as Severity] : 99;
      if (ra !== rb) return ra - rb;
      return b.elements.length - a.elements.length;
    });

    const display = shown!; // every url has ≥1 scan, so the family always has one
    const shot = shotByScan.get(display.id);
    pages.push({
      url: grouped ? pattern : urls[0],
      grouped,
      pageCount: urls.length,
      status: display.status as ScanStatus,
      scannedAt: display.createdAt.toISOString(),
      totalScans,
      pending,
      counts,
      groups,
      ...(display.error ? { error: display.error } : {}),
      ...(shot ? { shot } : {}),
    });
  }

  // Worst pages first: most criticals, then total issues.
  pages.sort(
    (a, b) =>
      b.counts.critical - a.counts.critical ||
      b.counts.serious - a.counts.serious ||
      b.counts.total - a.counts.total,
  );

  return { siteId, pages, counts: siteCounts };
}

/** Compact, at-a-glance rollup for one site, shown on the sites list. Derived from
 *  the same page grouping as the detail view (sans evidence), so the issue counts a
 *  user sees in the list match what they'll find when they open the site. */
export type SiteSummary = {
  pageCount: number;
  counts: SeverityCounts;
  lastScannedAt: string | null;
  pending: number;
  /** Overall posture across the site's pages, worst-state-wins for the at-a-glance chip. */
  status: "none" | "queued" | "running" | "complete" | "error";
};

// Wrapped in React cache so the dashboard layout's sidebar and the overview page
// share one computation per site within a single request, instead of querying twice.
export const getSiteSummary = cache(async (siteId: string): Promise<SiteSummary> => {
  const { pages, counts } = await getSitePages(siteId, { evidence: false });

  if (pages.length === 0) {
    return { pageCount: 0, counts, lastScannedAt: null, pending: 0, status: "none" };
  }

  let lastScannedAt: string | null = null;
  let pending = 0;
  let hasError = false;
  let hasRunning = false;
  let hasQueued = false;
  for (const p of pages) {
    if (!lastScannedAt || p.scannedAt > lastScannedAt) lastScannedAt = p.scannedAt;
    pending += p.pending;
    if (p.error || p.status === "error") hasError = true;
    if (p.status === "running") hasRunning = true;
    if (p.status === "queued") hasQueued = true;
  }

  const status: SiteSummary["status"] = hasError
    ? "error"
    : hasRunning
      ? "running"
      : hasQueued
        ? "queued"
        : "complete";

  return { pageCount: pages.length, counts, lastScannedAt, pending, status };
});

/** Summaries for many sites, keyed by siteId — for the dashboard list. */
export async function getSiteSummaries(
  siteIds: string[],
): Promise<Map<string, SiteSummary>> {
  const entries = await Promise.all(
    siteIds.map(async (id) => [id, await getSiteSummary(id)] as const),
  );
  return new Map(entries);
}

/** Distinct issues detected on one day (across the given sites). */
export type TrendPoint = { date: string; total: number; critical: number };

/**
 * Issues-over-time series. `points` is one entry per day (zero-filled, oldest first);
 * `total`/`criticalTotal` are the distinct issues across the whole window.
 */
export type IssuesTrend = { points: TrendPoint[]; total: number; criticalTotal: number };

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

/**
 * Distinct accessibility issues detected over the last `days` days, bucketed by the
 * scan's completion day. A site is re-scanned on every release (and on every HMR
 * reload in dev), so the SAME page produces many scans of the same findings; we
 * therefore de-dupe by issue identity (url + rule + element), the same granularity
 * the report uses — counting raw finding rows would multiply every issue by how many
 * times its page happened to be scanned. Distinct per day for the chart; distinct
 * across the window for the headline.
 */
export async function getIssuesTrend(siteIds: string[], days = 14): Promise<IssuesTrend> {
  // Zero-filled buckets, oldest → newest, so the chart axis is always continuous.
  const buckets = new Map<string, TrendPoint>();
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    buckets.set(dayKey(d), { date: dayKey(d), total: 0, critical: 0 });
  }
  const empty: IssuesTrend = { points: [...buckets.values()], total: 0, criticalTotal: 0 };
  if (siteIds.length === 0) return empty;

  const cutoff = new Date(today);
  cutoff.setUTCDate(cutoff.getUTCDate() - (days - 1));
  cutoff.setUTCHours(0, 0, 0, 0);

  const scans = await db
    .select({
      id: schema.scans.id,
      url: schema.scans.url,
      createdAt: schema.scans.createdAt,
      completedAt: schema.scans.completedAt,
    })
    .from(schema.scans)
    .where(and(inArray(schema.scans.siteId, siteIds), gte(schema.scans.createdAt, cutoff)));

  if (scans.length === 0) return empty;

  const scanMeta = new Map<string, { day: string; url: string }>();
  for (const s of scans) scanMeta.set(s.id, { day: dayKey(s.completedAt ?? s.createdAt), url: s.url });

  const rows = await db
    .select({
      scanId: schema.findings.scanId,
      ruleId: schema.findings.ruleId,
      selector: schema.findings.selector,
      htmlSnippet: schema.findings.htmlSnippet,
      impact: schema.findings.impact,
    })
    .from(schema.findings)
    .where(inArray(schema.findings.scanId, [...scanMeta.keys()]));

  // De-dupe an issue once per day (for the chart) and once across the window (headline).
  const seenPerDay = new Map<string, Set<string>>();
  const seenWindow = new Set<string>();
  const seenWindowCritical = new Set<string>();

  for (const r of rows) {
    const meta = scanMeta.get(r.scanId);
    if (!meta) continue;
    const bucket = buckets.get(meta.day);
    if (!bucket) continue;
    const key = `${meta.url}\n${r.ruleId}\n${r.selector}\n${r.htmlSnippet}`;
    const isCritical = r.impact === "critical";

    let daySet = seenPerDay.get(meta.day);
    if (!daySet) seenPerDay.set(meta.day, (daySet = new Set()));
    if (!daySet.has(key)) {
      daySet.add(key);
      bucket.total += 1;
      if (isCritical) bucket.critical += 1;
    }
    if (!seenWindow.has(key)) {
      seenWindow.add(key);
      if (isCritical) seenWindowCritical.add(key);
    }
  }

  return {
    points: [...buckets.values()],
    total: seenWindow.size,
    criticalTotal: seenWindowCritical.size,
  };
}
