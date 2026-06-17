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
  const { snapshots } = timeline;

  // Default the compare to the two most recent snapshots (newest = `to`,
  // chronological predecessor = `from`). Fall back gracefully if a passed id no
  // longer resolves.
  const ids = new Set(snapshots.map((s) => s.id));
  const toId = toParam && ids.has(toParam) ? toParam : snapshots[0]?.id;
  const fromId = fromParam && ids.has(fromParam) ? fromParam : snapshots[1]?.id ?? snapshots[0]?.id;

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

  // Headline facts — latest snapshot vs the first one we have on record.
  const latest = snapshots[0]!;
  const first = snapshots[snapshots.length - 1]!; // oldest, since newest-first
  const issuesDelta = snapshots.length >= 2 ? latest.counts.total - first.counts.total : null;
  const trendValue =
    issuesDelta === null
      ? "—"
      : issuesDelta === 0
        ? "±0"
        : `${issuesDelta > 0 ? "+" : "−"}${Math.abs(issuesDelta)}`;
  const trendHint =
    issuesDelta === null
      ? "Need two scans"
      : issuesDelta > 0
        ? "More issues than first scan"
        : issuesDelta < 0
          ? "Fewer issues than first scan"
          : "Flat vs first scan";

  const metrics: Metric[] = [
    { label: "Latest score", value: latest.score, hint: "Out of 100" },
    {
      label: "Open issues now",
      value: latest.counts.total,
      ...(latest.counts.critical > 0 ? { severity: "critical" as const } : {}),
      hint:
        latest.counts.critical > 0
          ? `${latest.counts.critical} critical`
          : latest.counts.total > 0
            ? "None critical"
            : "All clear 🎉",
    },
    {
      label: "Scans tracked",
      value: snapshots.length,
      hint: snapshots.length === 1 ? "scan" : "newest first",
    },
    { label: "Trend vs first", value: trendValue, hint: trendHint },
  ];

  return (
    <PageShell>
      {header}

      <div className="mt-6">
        <MetricStrip items={metrics} />
      </div>

      <Section
        title="Timeline"
        description={`${snapshots.length} ${snapshots.length === 1 ? "scan" : "scans"}, newest first.`}
      >
        <ScanTimelineList snapshots={snapshots} />
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
