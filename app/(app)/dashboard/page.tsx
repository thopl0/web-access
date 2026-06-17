import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { LayoutGrid, Plus } from "lucide-react";

import { SiteCard } from "@/components/dashboard/SiteCard";
import { ScoreBadge } from "@/components/dashboard/ScoreBadge";
import { WcagScorecard, EaaReadiness } from "@/components/dashboard/Compliance";
import { QuickWins } from "@/components/dashboard/Insights";
import { EmptyState, PageHeader, Panel } from "@/components/dashboard/ui";
import { PageShell, Section, MetricStrip, type Metric } from "@/components/dashboard/layout";
import { DeltaChip, SeverityDonut, TrendArea } from "@/components/dashboard/charts";
import { Button } from "@/components/ui/Button";
import { getUser } from "@/lib/server/dal";
import { db, schema } from "@/lib/server/db";
import { appOrigin } from "@/lib/server/origin";
import { embedSnippet } from "@/lib/embed";
import { getIssuesTrend, getSiteSummaries, type SiteSummary } from "@/lib/server/report";
import { getUserIssues } from "@/lib/server/issues";
import { summarizeConformance } from "@/lib/wcag";
import { emptyCounts, type SeverityCounts } from "@/lib/severity";

export const metadata: Metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

const EMPTY_SUMMARY: SiteSummary = {
  pageCount: 0,
  counts: emptyCounts(),
  lastScannedAt: null,
  pending: 0,
  status: "none",
};

export default async function DashboardPage() {
  const user = await getUser();
  const origin = await appOrigin();

  const sites = await db
    .select()
    .from(schema.sites)
    .where(eq(schema.sites.ownerId, user!.id))
    .orderBy(desc(schema.sites.createdAt));

  const summaries = await getSiteSummaries(sites.map((s) => s.id));
  const rows = sites.map((s) => summaries.get(s.id) ?? EMPTY_SUMMARY);

  // Portfolio rollups.
  const portfolio: SeverityCounts = rows.reduce((acc, s) => {
    acc.critical += s.counts.critical;
    acc.serious += s.counts.serious;
    acc.moderate += s.counts.moderate;
    acc.minor += s.counts.minor;
    acc.total += s.counts.total;
    return acc;
  }, emptyCounts());
  const pagesMonitored = rows.reduce((n, s) => n + s.pageCount, 0);
  const sitesWithIssues = rows.filter((s) => s.counts.total > 0).length;
  const sitesScanned = rows.filter((s) => s.pageCount > 0).length;

  const hasSites = sites.length > 0;
  const pendingSites = sites.filter((s) => s.status === "pending");

  // Open issues across all sites — powers the WCAG/EAA conformance summary (and quick wins).
  const openIssues = hasSites ? await getUserIssues(user!.id, { view: "open" }) : [];
  const conformance = summarizeConformance(openIssues, { evaluated: pagesMonitored > 0 });

  // 14-day issues-found trend (distinct issues, de-duped across re-scans) + WoW delta.
  const trendData = hasSites
    ? await getIssuesTrend(sites.map((s) => s.id), 14)
    : { points: [], total: 0, criticalTotal: 0 };
  const trend = trendData.points;
  const found = trendData.total;
  const last7 = trend.slice(7).reduce((n, p) => n + p.total, 0);
  const prev7 = trend.slice(0, 7).reduce((n, p) => n + p.total, 0);
  const delta = prev7 === 0 ? (last7 > 0 ? 100 : null) : Math.round(((last7 - prev7) / prev7) * 100);
  const fmtDay = (iso: string) =>
    new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric" });

  const metrics: Metric[] = [
    { label: "Sites", value: sites.length, hint: `${sitesScanned} scanned` },
    { label: "Pages monitored", value: pagesMonitored, hint: "Auto-scanned" },
    {
      label: "Open issues",
      value: portfolio.total,
      href: "/dashboard/issues",
      hint: portfolio.total > 0 ? `Across ${sitesWithIssues} ${sitesWithIssues === 1 ? "site" : "sites"}` : "All clear 🎉",
    },
    {
      label: "Critical",
      value: portfolio.critical,
      href: "/dashboard/issues?severity=critical",
      ...(portfolio.critical > 0 ? { severity: "critical" as const } : {}),
      hint: portfolio.critical > 0 ? "Need urgent fixes" : "None open",
    },
  ];

  return (
    <PageShell>
      <PageHeader
        titleId="dashboard-title"
        eyebrow={user?.name ? `Welcome back, ${user.name}` : "Welcome back"}
        title="Overview"
        lead="Accessibility health across all your registered sites."
        actions={
          hasSites ? (
            <Button href="/dashboard/sites/new" variant="blue" size="sm">
              <Plus className="size-4" strokeWidth={2.75} aria-hidden />
              Add site
            </Button>
          ) : undefined
        }
      />

      {hasSites ? (
        <>
          {/* Nudge: sites still awaiting their snippet. */}
          {pendingSites.length > 0 ? (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-yellow/50 bg-yellow/10 px-4 py-3">
              <p className="text-sm font-bold text-fg">
                {pendingSites.length === 1
                  ? `“${pendingSites[0].name}” is waiting for its snippet.`
                  : `${pendingSites.length} sites are waiting for their snippet.`}{" "}
                <span className="font-normal text-fg-soft">Finish setup to start scanning.</span>
              </p>
              <Link
                href={`/dashboard/${pendingSites[0].id}/settings`}
                className="shrink-0 text-sm font-bold text-link underline underline-offset-2"
              >
                Finish setup →
              </Link>
            </div>
          ) : null}

          {/* Headline metrics — one calm band, not four boxes. */}
          <div className="mt-6">
            <MetricStrip items={metrics} />
          </div>

          {/* Hero: the trend over time (the "living picture") + score + breakdown. */}
          <Section title="Accessibility health" className="mt-8">
            <div className="grid gap-4 lg:grid-cols-3">
              <Panel className="lg:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {pagesMonitored > 0 ? (
                    <ScoreBadge counts={portfolio} pageCount={pagesMonitored} />
                  ) : (
                    <p className="font-display text-lg font-bold text-fg">No scans yet</p>
                  )}
                  <div className="text-right">
                    <p className="font-display text-2xl font-bold tabular-nums text-fg">{found}</p>
                    <p className="text-xs text-fg-soft">issues · last 14 days</p>
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
                  <SeverityDonut counts={portfolio} />
                </div>
              </Panel>
            </div>
          </Section>

          {/* Compliance: WCAG conformance + EU Accessibility Act readiness */}
          <Section title="WCAG 2.1 conformance">
            <div className="grid gap-4 lg:grid-cols-3">
              <Panel className="lg:col-span-2">
                <WcagScorecard report={conformance} />
              </Panel>
              <EaaReadiness report={conformance} />
            </div>
          </Section>

          {/* Where to start — the highest-leverage quick fixes. */}
          {portfolio.total > 0 ? (
            <Section>
              <Panel>
                <QuickWins issues={openIssues} />
              </Panel>
            </Section>
          ) : null}

          {/* Sites */}
          <Section title="Your sites" action={<span className="text-sm text-fg-soft">{sites.length}</span>}>
            <ul className="flex flex-col gap-5">
              {sites.map((site) => (
                <SiteCard key={site.id} site={site} summary={summaries.get(site.id) ?? EMPTY_SUMMARY} snippet={embedSnippet(origin, site.id)} />
              ))}
            </ul>
          </Section>
        </>
      ) : (
        // First-run: no sites yet — lead straight into the onboarding wizard.
        <EmptyState
          className="mt-8"
          icon={<LayoutGrid className="size-6" aria-hidden strokeWidth={2} />}
          title="Register your first site"
          action={
            <Button href="/dashboard/sites/new" variant="blue" size="md">
              <Plus className="size-4" strokeWidth={2.75} aria-hidden />
              Add your first site
            </Button>
          }
        >
          Add a site, drop in the one-line snippet, and we&apos;ll verify it&apos;s live — then
          accessibility scans run automatically on every release.
        </EmptyState>
      )}
    </PageShell>
  );
}
