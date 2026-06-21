import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ExternalLink, FileSearch, GitCompare } from "lucide-react";

import { SiteStatusChip } from "@/components/dashboard/SiteStatusChip";
import { PrintButton } from "@/components/dashboard/PrintButton";
import { CompareSelect } from "@/components/dashboard/CompareSelect";
import { ScanDiffView, ScanTimelineList } from "@/components/dashboard/ScanHistory";
import { CodeChip, EmptyState, PageHeader } from "@/components/dashboard/ui";
import { PageShell, Section, MetricStrip, type Metric } from "@/components/dashboard/layout";
import { verifySession } from "@/lib/server/dal";
import { db, schema } from "@/lib/server/db";
import { getScanDiff, getScanTimeline } from "@/lib/server/insights";

export const metadata: Metadata = { title: "Scan history" };
export const dynamic = "force-dynamic";

export default async function ScanHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { siteId } = await params;
  const { from: fromParam, to: toParam } = await searchParams;
  const { userId } = await verifySession();

  // Ownership check — never trust the URL param. Unowned/other users' sites 404.
  const owned = await db
    .select()
    .from(schema.sites)
    .where(and(eq(schema.sites.id, siteId), eq(schema.sites.ownerId, userId)))
    .limit(1);
  const site = owned[0];
  if (!site) notFound();

  const timeline = await getScanTimeline(siteId);
  const { snapshots, changes } = timeline;

  // Default the compare to the two most recent COMPARABLE snapshots (same scope — like-for-like),
  // newest = `to`, its same-scope predecessor = `from`. Falls back to the two most recent overall if
  // there's no same-scope pair. Honors explicit URL params first, ignoring ids that no longer resolve.
  const ids = new Set(snapshots.map((s) => s.id));
  const newest = snapshots[0];
  const comparablePrev = newest
    ? snapshots.find((s, i) => i > 0 && s.isCrawl === newest.isCrawl)
    : undefined;
  const defaultToId = newest?.id;
  const defaultFromId = comparablePrev?.id ?? snapshots[1]?.id ?? newest?.id;
  const toId = toParam && ids.has(toParam) ? toParam : defaultToId;
  const fromId = fromParam && ids.has(fromParam) ? fromParam : defaultFromId;

  const canCompare = snapshots.length >= 2 && fromId && toId;
  const diff = canCompare ? await getScanDiff(siteId, fromId, toId) : null;

  const header = (
    <>
      <PageHeader
        titleId="history-title"
        eyebrow="Scan history"
        title={site.name}
        actions={<PrintButton label="Print / Save report" />}
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
    </>
  );

  // No scans recorded yet — real history fills in as the site is scanned over time.
  if (snapshots.length === 0) {
    return (
      <PageShell>
        {header}
        <EmptyState
          className="mt-8"
          icon={<FileSearch className="size-6" aria-hidden strokeWidth={2} />}
          title="No scan history yet"
        >
          Once your verified snippet runs and re-runs over time, every scan shows up here as a
          timeline you can compare.
        </EmptyState>
      </PageShell>
    );
  }

  // Headline facts. Full crawls are the site-wide source of truth; single-page re-scans are
  // spot checks between crawls. The score / open-issues / trend cards stay within the crawl
  // scope so a 1-page re-scan never reads as "fixed 60 issues". Fall back to the latest snapshot
  // overall only when no crawl exists yet.
  const crawls = snapshots.filter((s) => s.isCrawl); // newest-first
  const headline = crawls[0] ?? snapshots[0]!;
  const hasSpotChecks = snapshots.some((s) => !s.isCrawl);

  // Trend must be like-for-like: most recent crawl vs the FIRST crawl. Needs ≥ 2 crawls.
  const firstCrawl = crawls[crawls.length - 1];
  const issuesDelta =
    crawls.length >= 2 ? crawls[0]!.counts.total - firstCrawl!.counts.total : null;
  // Plain-language the trend: a positive issuesDelta means MORE issues (worse), so spell out the
  // direction in words — matching the timeline's IssueDelta wording — rather than a signed integer.
  const trendValue =
    issuesDelta === null
      ? "—"
      : issuesDelta === 0
        ? "No change"
        : `${Math.abs(issuesDelta)} ${issuesDelta > 0 ? "more" : "fewer"} ${
            Math.abs(issuesDelta) === 1 ? "issue" : "issues"
          }`;
  const trendHint =
    issuesDelta === null
      ? "Needs two full crawls"
      : issuesDelta > 0
        ? "More issues than your first crawl"
        : issuesDelta < 0
          ? "Fewer issues than your first crawl"
          : "Flat vs your first crawl";

  const scopeNote = crawls.length > 0 ? "Latest full crawl" : "Latest scan (no crawl yet)";

  const metrics: Metric[] = [
    { label: "Accessibility score", value: headline.score, hint: scopeNote },
    {
      label: "Open issues now",
      value: headline.counts.total,
      ...(headline.counts.critical > 0 ? { severity: "critical" as const } : {}),
      hint:
        headline.counts.critical > 0
          ? `${headline.counts.critical} critical`
          : headline.counts.total > 0
            ? "None critical"
            : "All clear 🎉",
    },
    {
      label: "Scans tracked",
      value: snapshots.length,
      hint: snapshots.length === 1 ? "scan" : "newest first",
    },
    { label: "Since your first crawl", value: trendValue, hint: trendHint },
  ];

  return (
    <PageShell>
      {header}

      <div className="mt-6">
        <MetricStrip items={metrics} />
        {hasSpotChecks ? (
          <p className="mt-3 text-xs text-fg-soft">
            Headline numbers track full crawls. Single-page entries below are spot checks between
            crawls — they cover one page, so don&apos;t read them against a full crawl.
          </p>
        ) : null}
      </div>

      <Section
        title="Timeline"
        description={`${snapshots.length} ${snapshots.length === 1 ? "scan" : "scans"}, newest first.`}
      >
        <ScanTimelineList snapshots={snapshots} changes={changes} siteId={siteId} />
      </Section>

      <Section
        title="Compare scans"
        description="See what's new, fixed, or regressed between any two scans."
        action={
          canCompare ? (
            <CompareSelect
              siteId={siteId}
              options={snapshots.map((s) => ({ id: s.id, label: s.label }))}
              fromId={fromId}
              toId={toId}
            />
          ) : undefined
        }
      >
        {canCompare ? (
          diff ? (
            <ScanDiffView diff={diff} siteId={siteId} />
          ) : (
            <EmptyState
              icon={<GitCompare className="size-6" aria-hidden strokeWidth={2} />}
              title="Couldn't load that comparison"
            >
              Those two scans couldn&apos;t be compared. Pick a different pair above.
            </EmptyState>
          )
        ) : (
          <EmptyState
            icon={<GitCompare className="size-6" aria-hidden strokeWidth={2} />}
            title="Need two scans to compare"
          >
            Once your site has been scanned more than once, you can diff any two runs here.
          </EmptyState>
        )}
      </Section>
    </PageShell>
  );
}
