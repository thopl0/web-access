import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { CircleCheck, ExternalLink, FileSearch, ShieldCheck } from "lucide-react";

import { SiteReport } from "@/components/dashboard/SiteReport";
import { StartHere } from "@/components/dashboard/StartHere";
import { ProUpsell } from "@/components/dashboard/ProUpsell";
import { ChangesSinceLastScan } from "@/components/dashboard/ChangesSinceLastScan";
import { SiteStatusChip } from "@/components/dashboard/SiteStatusChip";
import { InstallInstructions } from "@/components/dashboard/InstallInstructions";
import { VerifyPanel } from "@/components/dashboard/VerifyPanel";
import { SiteOverview } from "@/components/dashboard/SiteOverview";
import { ScoreBadge } from "@/components/dashboard/ScoreBadge";
import { DeltaChip, SeverityDonut, TrendArea } from "@/components/dashboard/charts";
import type { BoardPage } from "@/components/dashboard/SiteBoard";
import { CodeChip, EmptyState, PageHeader, Panel } from "@/components/dashboard/ui";
import { PageShell, Section } from "@/components/dashboard/layout";
import { Button } from "@/components/ui/Button";
import { verifySession } from "@/lib/server/dal";
import { db, schema } from "@/lib/server/db";
import { appOrigin } from "@/lib/server/origin";
import { embedSnippet } from "@/lib/embed";
import { getIssuesTrend, getSitePages, pathOf, rollupByRule, siteStartHere } from "@/lib/server/report";
import { getLiveFixContext, isElementLiveFixed, openRuleIds } from "@/lib/server/issues";
import { getScanDelta } from "@/lib/server/verification";
import { explainRule } from "@/lib/explain";
import { SEVERITY_RANK, emptyCounts, type Severity } from "@/lib/severity";
import { summarizeConformance } from "@/lib/wcag";

export const metadata: Metadata = { title: "Site report" };
export const dynamic = "force-dynamic";

export default async function SiteReportsPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const { userId } = await verifySession();

  // Ownership check — never trust the URL param. Unowned/other users' sites 404.
  const owned = await db
    .select()
    .from(schema.sites)
    .where(and(eq(schema.sites.id, siteId), eq(schema.sites.ownerId, userId)))
    .limit(1);
  const site = owned[0];
  if (!site) notFound();

  const verified = site.status === "verified";
  // `summary: true` loads the stored intelligent-report summary for the "Start here" card; the rest of
  // the page is unchanged. `siteStartHere` then picks the most-urgent stored summary or, failing that,
  // computes a deterministic site-wide legal-risk ranking — so the card is always populated.
  const { pages: allPages, fixesLocked } = await getSitePages(siteId, { summary: true });
  const startHere = siteStartHere(allPages);
  const allRules = rollupByRule(allPages);
  const hasPages = allPages.length > 0;
  const snippet = embedSnippet(await appOrigin(), site.id);

  // Lifecycle-aware view: drop rules the owner has already fixed / auto-fixed / muted, so this report
  // agrees with the Issues tab (it used to render RAW scan findings — fixed issues lingered, counts
  // were inflated). AND drop individual spots already covered by an enabled live patch, so applying
  // "fix all" visibly reduces the count (e.g. contrast 156 → 87 once the auto-fixable spots are patched)
  // and a rule disappears once every spot is covered.
  const openIds = await openRuleIds(siteId, allRules);
  const liveFix = await getLiveFixContext(siteId);
  const pages = allPages.map((p) => {
    const groups = p.groups
      .filter((g) => openIds.has(g.ruleId))
      .map((g) => ({ ...g, elements: g.elements.filter((el) => !isElementLiveFixed(el.selector, el.fix, liveFix)) }))
      .filter((g) => g.elements.length > 0);
    const c = emptyCounts();
    for (const g of groups) {
      const sev = g.impact as Severity | null;
      if (sev && sev in SEVERITY_RANK) {
        c[sev] += g.elements.length;
        c.total += g.elements.length;
      }
    }
    return { ...p, groups, counts: c };
  });
  const rules = rollupByRule(pages);

  // Open totals: `counts` = open spots by severity (drives the score / donut / severity bar); `openTypes`
  // + `openPageCount` are the "N types of issues across M pages" headline; `openCriticalTypes` = the
  // Critical metric.
  const counts = emptyCounts();
  for (const r of rules) {
    const sev = r.impact as Severity | null;
    if (sev && sev in SEVERITY_RANK) {
      counts[sev] += r.totalSpots;
      counts.total += r.totalSpots;
    }
  }
  const openTypes = rules.length;
  const affectedPages = new Set<string>();
  for (const r of rules) for (const p of r.pages) affectedPages.add(p.url);
  const openPageCount = affectedPages.size;
  const openCriticalTypes = rules.filter((r) => r.impact === "critical").length;

  // Severity breakdown by ISSUE TYPE (one per rule), so the donut/chips aren't dominated by a single
  // high-volume rule the way spot counts are (e.g. contrast on 156 elements). Spots stay on `counts`.
  const typeCounts = emptyCounts();
  for (const r of rules) {
    const sev = r.impact as Severity | null;
    if (sev && sev in SEVERITY_RANK) {
      typeCounts[sev] += 1;
      typeCounts.total += 1;
    }
  }

  const conformance = summarizeConformance(rules, { evaluated: hasPages });

  // Verification loop (plan §8.5): compare the latest re-scan against the previous one so the report
  // can CONFIRM which fixes actually worked. Only meaningful once there are scans to compare.
  const scanDelta = hasPages ? await getScanDelta(siteId) : null;

  const trendData = hasPages
    ? await getIssuesTrend([siteId], 14)
    : { points: [], total: 0, criticalTotal: 0 };
  const trend = trendData.points;
  const found = trendData.total;
  const last7 = trend.slice(7).reduce((n, p) => n + p.total, 0);
  const prev7 = trend.slice(0, 7).reduce((n, p) => n + p.total, 0);
  const delta = prev7 === 0 ? (last7 > 0 ? 100 : null) : Math.round(((last7 - prev7) / prev7) * 100);
  const fmtDay = (iso: string) =>
    new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric" });

  const lastScan = pages.reduce<string | null>(
    (max, p) => (!max || p.scannedAt > max ? p.scannedAt : max),
    null,
  );

  // Compact conformance read-out — the full checklist lives on the Conformance tab.
  const aaOk = conformance.aaConformant;

  // "Site laid bare" board: each scanned page as its screenshot with issues pinned on it.
  const boardPages: BoardPage[] = pages.map((p) => {
    const markers = p.groups.flatMap((g) =>
      g.elements
        .filter((el) => el.box)
        .map((el) => ({
          ruleId: g.ruleId,
          x: el.box!.x,
          y: el.box!.y,
          w: el.box!.w,
          h: el.box!.h,
          impact: (g.impact ?? "minor") as Severity,
          title: explainRule(g.ruleId)?.title ?? g.message,
        })),
    );
    const issues = p.groups
      .map((g) => ({
        ruleId: g.ruleId,
        title: explainRule(g.ruleId)?.title ?? g.message,
        impact: (g.impact ?? null) as Severity | null,
        count: g.elements.length,
      }))
      .sort(
        (a, b) =>
          (a.impact ? SEVERITY_RANK[a.impact] : 99) - (b.impact ? SEVERITY_RANK[b.impact] : 99) ||
          b.count - a.count,
      );
    // Per-page issue-type counts (one per rule), so a focused page's donut also reads by type, not spots.
    const pageTypeCounts = emptyCounts();
    for (const i of issues) {
      if (i.impact && i.impact in SEVERITY_RANK) {
        pageTypeCounts[i.impact] += 1;
        pageTypeCounts.total += 1;
      }
    }
    return {
      id: p.url,
      path: pathOf(p.url),
      siteId,
      counts: p.counts,
      typeCounts: pageTypeCounts,
      ...(p.shot ? { shot: { src: p.shot.src, width: p.shot.width, height: p.shot.height } } : {}),
      markers,
      issues,
      grouped: p.grouped,
      pageCount: p.pageCount,
      status: p.status,
    } satisfies BoardPage;
  });

  // Lead the board with the home page (root path), then keep getSitePages' worst-first order for the
  // rest. Array.sort is stable, so the non-home cards retain their "most issues first" ordering. (Only
  // the board is reordered — `pages` stays worst-first so the "Start here" summary still leads with the
  // most urgent page.)
  boardPages.sort((a, b) => (a.path === "/" ? 0 : 1) - (b.path === "/" ? 0 : 1));

  return (
    <PageShell>
      <PageHeader
        titleId="reports-title"
        eyebrow="Accessibility report"
        title={site.name}
        lead={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <SiteStatusChip status={site.status} />
            <span className="inline-flex items-center gap-1.5">
              Site ID <CodeChip>{site.id}</CodeChip>
            </span>
            {site.origin ? (
              <a
                href={site.origin}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 break-all font-bold text-link no-underline underline-offset-2 hover:underline"
              >
                {site.origin.replace(/^https?:\/\//, "")}
                <ExternalLink className="size-3.5 shrink-0" aria-hidden strokeWidth={2.5} />
              </a>
            ) : null}
          </span>
        }
      />

      {!verified ? (
        <Panel className="mt-8">
          <h2 className="font-display text-lg font-bold text-fg">Finish setup</h2>
          <p className="mt-1 mb-5 text-sm text-fg-soft">
            Add the snippet to your site&apos;s <code className="font-mono text-xs">&lt;head&gt;</code>,
            then verify — scans and this report fill in automatically once it&apos;s live.
          </p>
          <InstallInstructions snippet={snippet} />
          <div className="mt-6 border-t border-[var(--color-panel-line)] pt-5">
            <VerifyPanel siteId={site.id} initialStatus={site.status} hasOrigin={Boolean(site.origin)} />
          </div>
        </Panel>
      ) : !hasPages ? (
        <EmptyState
          className="mt-8"
          icon={<FileSearch className="size-6" aria-hidden strokeWidth={2} />}
          title="No scans yet"
        >
          Your snippet is verified — once it runs on a page, scans and their findings show up here
          automatically.
        </EmptyState>
      ) : (
        <>
          {/* Headline: lead with the single accessibility grade/score + the open-issue count, so a
              non-technical owner sees "how am I doing" before any screenshots or issue lists. The
              fuller health/trend panel still lives lower down (in SiteOverview). */}
          <Panel className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
              <ScoreBadge counts={counts} pageCount={allPages.length} />
              <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
                <div>
                  <p className="font-display text-3xl font-bold tabular-nums text-fg">{openTypes}</p>
                  <p className="text-xs font-bold uppercase tracking-wide text-fg-soft">
                    {openTypes === 1 ? "Open issue type" : "Open issue types"}
                  </p>
                  <p className="mt-0.5 text-xs text-fg-soft">
                    {openTypes > 0
                      ? `Across ${openPageCount} ${openPageCount === 1 ? "page" : "pages"}`
                      : "All clear 🎉"}
                  </p>
                </div>
                <div>
                  <p
                    className={`font-display text-3xl font-bold tabular-nums ${openCriticalTypes > 0 ? "text-pink" : "text-fg-soft"}`}
                  >
                    {openCriticalTypes}
                  </p>
                  <p className="text-xs font-bold uppercase tracking-wide text-fg-soft">Critical</p>
                </div>
              </div>
            </div>
          </Panel>

          {/* At-a-glance health — pulled up so the trend + severity mix sit near the top, not buried
              below the issues list. Site-level (the per-page rescoping stays with the board lower down).
              Score isn't repeated here — the headline panel above already shows it. */}
          <Section title="Accessibility health" className="mt-8">
            <div className="grid gap-4 lg:grid-cols-3">
              <Panel className="lg:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-display text-sm font-bold uppercase tracking-wide text-fg-soft">
                      Issues found
                    </p>
                    <p className="text-xs text-fg-soft">Last 14 days</p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-2xl font-bold tabular-nums text-fg">{found}</p>
                    <DeltaChip delta={delta} />
                  </div>
                </div>
                <div className="mt-5">
                  <TrendArea points={trend} />
                  <div className="mt-2 flex items-center justify-between text-xs text-fg-soft">
                    <span>{trend.length ? fmtDay(trend[0].date) : ""}</span>
                    <span className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full bg-blue" /> Issues</span>
                      <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full bg-pink" /> Critical</span>
                    </span>
                    <span>{trend.length ? fmtDay(trend[trend.length - 1].date) : ""}</span>
                  </div>
                </div>
              </Panel>

              <Panel>
                <p className="font-display text-sm font-bold uppercase tracking-wide text-fg-soft">
                  Severity breakdown
                </p>
                <div className="mt-4">
                  <SeverityDonut counts={typeCounts} unitLabel="issue type" />
                </div>
              </Panel>
            </div>
          </Section>

          {/* Verification loop: what the latest re-scan CONFIRMS was fixed (and what's newly
              introduced) — a short, actionable change-feed kept near the top. Self-suppresses on a
              first scan or when nothing changed. */}
          {scanDelta?.hasPrevious && (scanDelta.resolved.length > 0 || scanDelta.introduced.length > 0) ? (
            <div className="mt-6">
              <ChangesSinceLastScan delta={scanDelta} />
            </div>
          ) : null}

          {/* Free owners (fixes withheld): lead with what Pro adds so the next step is upgrading. */}
          {fixesLocked ? (
            <div className="mt-6">
              <ProUpsell />
            </div>
          ) : null}

          {/* The actual issues — what to fix — lead here, above the screenshot board. Filterable;
              defaults to grouping by issue type so a problem that recurs on many pages reads as one
              fixable entry, not N repeats. SiteReport renders its own control bar + results heading,
              so the Section title here is the only "Issues" heading (no double heading). */}
          <Section title="Issues">
            <SiteReport rules={rules} pages={pages} counts={typeCounts} siteId={siteId} />
          </Section>

          {/* "Your pages" board + its metric band, which re-scopes to a page when one is opened. Sits
              below the issues so it's an explorer, not a scroll-wall. */}
          <SiteOverview
            pages={boardPages}
            siteTypeCounts={typeCounts}
            pageCount={pages.length}
            affectedPageCount={openPageCount}
            lastScanLabel={lastScan ? fmtDay(lastScan.slice(0, 10)) : "—"}
          />

          {/* "What to fix first": the plain-English summary + legal-risk triage. Demoted below the
              issues list + screenshot board so the report leads with the findings themselves, not a
              wall of AI prose up top. */}
          {startHere ? (
            <div className="mt-10">
              <StartHere startHere={startHere} />
            </div>
          ) : null}

          {/* Conformance: a slim read-out that links to the full WCAG checklist tab. */}
          <Section title="Conformance">
            <Panel>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  {aaOk ? (
                    <CircleCheck className="size-6 shrink-0 text-green" aria-hidden strokeWidth={2.25} />
                  ) : (
                    <ShieldCheck className="size-6 shrink-0 text-[color-mix(in_srgb,var(--color-fg)_60%,var(--yellow))]" aria-hidden strokeWidth={2.25} />
                  )}
                  <div className="min-w-0">
                    <p className="font-display font-bold text-fg">
                      {aaOk ? "WCAG 2.1 A/AA conformant" : `${conformance.blockingAA} ${conformance.blockingAA === 1 ? "criterion" : "criteria"} failing`}
                    </p>
                    <p className="mt-0.5 text-sm text-fg-soft">
                      {aaOk
                        ? "Automated checks pass — some criteria still need manual review."
                        : "Plus manual-review criteria the automation can't judge — see the full checklist."}
                    </p>
                  </div>
                </div>
                <Button href={`/dashboard/${siteId}/conformance`} variant="outline" size="sm">
                  View full WCAG checklist →
                </Button>
              </div>
            </Panel>
          </Section>
        </>
      )}
    </PageShell>
  );
}
