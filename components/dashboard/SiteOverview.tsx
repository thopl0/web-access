"use client";

import { useState } from "react";

import { SiteBoard, type BoardPage } from "@/components/dashboard/SiteBoard";
import { Section, MetricStrip, type Metric } from "@/components/dashboard/layout";
import { healthScore } from "@/lib/score";
import type { SeverityCounts } from "@/lib/severity";

/**
 * The "Your pages" explorer: a headline metric band over the page board. Clicking a page in the board
 * re-scopes the metric band to THAT page's numbers (client-side, instant). The site's trend + severity
 * breakdown now live in their own "Accessibility health" section near the top of the report, so this
 * component is purely the per-page board + its band.
 */
export function SiteOverview({
  pages,
  siteTypeCounts,
  pageCount,
  affectedPageCount,
  lastScanLabel,
}: {
  pages: BoardPage[];
  /** Open issues by severity (TYPE counts) — keeps this band consistent with the headline + donut. */
  siteTypeCounts: SeverityCounts;
  pageCount: number;
  /** Distinct pages with at least one open issue (the headline's "across N pages"). */
  affectedPageCount: number;
  lastScanLabel: string;
}) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const page = focusId ? pages.find((p) => p.id === focusId) ?? null : null;

  // Site-level band is board CONTEXT (pages scanned / affected / open types) so it agrees with the
  // headline up top — never the raw spot total, which read as "242 open issues" and contradicted the
  // "4 issue types" headline. A focused page shows that page's own spot counts ("on this page").
  const metrics: Metric[] = page
    ? [
        { label: "Issues here", value: page.counts.total, hint: "On this page" },
        {
          label: "Critical",
          value: page.counts.critical,
          ...(page.counts.critical > 0 ? { severity: "critical" as const } : {}),
          hint: page.counts.critical > 0 ? "Need urgent fixes" : "None",
        },
        {
          label: "Serious",
          value: page.counts.serious,
          ...(page.counts.serious > 0 ? { severity: "serious" as const } : {}),
          hint: page.counts.serious > 0 ? "High impact" : "None",
        },
        { label: "Accessibility score", value: `${healthScore(page.counts, 1)}`, hint: "Out of 100" },
      ]
    : [
        { label: "Pages scanned", value: pageCount, hint: "Auto-scanned" },
        {
          label: "Pages with issues",
          value: affectedPageCount,
          hint: affectedPageCount > 0 ? `of ${pageCount}` : "None 🎉",
        },
        {
          label: siteTypeCounts.total === 1 ? "Open issue type" : "Open issue types",
          value: siteTypeCounts.total,
          ...(siteTypeCounts.critical > 0 ? { severity: "critical" as const } : {}),
          hint: siteTypeCounts.critical > 0 ? `${siteTypeCounts.critical} critical` : "0 critical",
        },
        { label: "Last scan", value: lastScanLabel },
      ];

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
    </>
  );
}
