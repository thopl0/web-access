"use client";

import { useState } from "react";

import { SiteBoard, type BoardPage } from "@/components/dashboard/SiteBoard";
import { ScoreBadge } from "@/components/dashboard/ScoreBadge";
import { SeverityBar } from "@/components/dashboard/severity";
import { DeltaChip, SeverityDonut, TrendArea } from "@/components/dashboard/charts";
import { Panel } from "@/components/dashboard/ui";
import { Section, MetricStrip, type Metric } from "@/components/dashboard/layout";
import { healthScore } from "@/lib/score";
import type { SeverityCounts } from "@/lib/severity";
import type { TrendPoint } from "@/lib/server/report";

/**
 * The reactive top of a site's Overview: the page board plus the headline metric band and the
 * "Accessibility health" panel. When a page is opened in the board, the band + panel re-scope to
 * THAT page's numbers (client-side, instant — no refetch); back on the grid, they show the whole
 * site. The 14-day trend chart is inherently site-level, so in page view it's replaced by the
 * page's own severity breakdown.
 */
export function SiteOverview({
  pages,
  siteCounts,
  siteTypeCounts,
  pageCount,
  trend,
  found,
  delta,
  lastScanLabel,
}: {
  pages: BoardPage[];
  siteCounts: SeverityCounts;
  /** Issue counts by severity (not spots) — drives the severity-breakdown donut. */
  siteTypeCounts: SeverityCounts;
  pageCount: number;
  trend: TrendPoint[];
  found: number;
  delta: number | null;
  lastScanLabel: string;
}) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const page = focusId ? pages.find((p) => p.id === focusId) ?? null : null;

  const counts = page ? page.counts : siteCounts;
  // The donut shows the severity mix by ISSUE (so a single high-volume rule doesn't make it all
  // "serious"); everything else (score, metric band, severity bar) stays on spot counts.
  const breakdown = page ? page.typeCounts : siteTypeCounts;
  const scorePageCount = page ? 1 : pageCount;

  const metrics: Metric[] = page
    ? [
        { label: "Open issues", value: counts.total, hint: "On this page" },
        {
          label: "Critical",
          value: counts.critical,
          ...(counts.critical > 0 ? { severity: "critical" as const } : {}),
          hint: counts.critical > 0 ? "Need urgent fixes" : "None",
        },
        {
          label: "Serious",
          value: counts.serious,
          ...(counts.serious > 0 ? { severity: "serious" as const } : {}),
          hint: counts.serious > 0 ? "High impact" : "None",
        },
        { label: "Accessibility score", value: `${healthScore(counts, 1)}`, hint: "Out of 100" },
      ]
    : [
        {
          label: "Open issues",
          value: counts.total,
          hint: counts.total > 0 ? `Across ${pageCount} ${pageCount === 1 ? "page" : "pages"}` : "All clear 🎉",
        },
        {
          label: "Critical",
          value: counts.critical,
          ...(counts.critical > 0 ? { severity: "critical" as const } : {}),
          hint: counts.critical > 0 ? "Need urgent fixes" : "None open",
        },
        { label: "Pages", value: pageCount, hint: "Auto-scanned" },
        { label: "Last scan", value: lastScanLabel },
      ];

  const fmtDay = (iso: string) =>
    new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <>
      <div className="mt-8">
        <MetricStrip items={metrics} />
      </div>

      <Section
        title="Your pages"
        description="Every scanned page, with accessibility problems pinned where they are. Click a page to explore it."
      >
        <SiteBoard pages={pages} onFocusChange={setFocusId} previewLimit={6} />
      </Section>

      <Section title={page ? "This page's health" : "Accessibility health"}>
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel className="lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <ScoreBadge counts={counts} pageCount={scorePageCount} />
              {page ? (
                <div className="text-right">
                  <p className="font-display text-2xl font-bold tabular-nums text-fg">{counts.total}</p>
                  <p className="text-xs text-fg-soft">{counts.total === 1 ? "issue" : "issues"} on this page</p>
                </div>
              ) : (
                <div className="text-right">
                  <p className="font-display text-2xl font-bold tabular-nums text-fg">{found}</p>
                  <p className="text-xs text-fg-soft">issues · last 14 days</p>
                  <DeltaChip delta={delta} />
                </div>
              )}
            </div>

            <div className="mt-5">
              {page ? (
                // Per-page: a severity bar stands in for the (site-level) time series.
                <>
                  <SeverityBar counts={counts} />
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs font-bold text-fg-soft">
                    <span>{counts.critical} critical</span>
                    <span>{counts.serious} serious</span>
                    <span>{counts.moderate} moderate</span>
                    <span>{counts.minor} minor</span>
                  </div>
                </>
              ) : (
                <>
                  <TrendArea points={trend} />
                  <div className="mt-2 flex items-center justify-between text-xs text-fg-soft">
                    <span>{trend.length ? fmtDay(trend[0].date) : ""}</span>
                    <span className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full bg-blue" /> Issues</span>
                      <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full bg-pink" /> Critical</span>
                    </span>
                    <span>{trend.length ? fmtDay(trend[trend.length - 1].date) : ""}</span>
                  </div>
                </>
              )}
            </div>
          </Panel>

          <Panel>
            <p className="font-display text-sm font-bold uppercase tracking-wide text-fg-soft">
              Severity breakdown
            </p>
            <div className="mt-4">
              <SeverityDonut counts={breakdown} unitLabel="issue type" />
            </div>
          </Panel>
        </div>
      </Section>
    </>
  );
}
