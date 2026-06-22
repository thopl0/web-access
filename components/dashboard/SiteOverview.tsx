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
  siteCounts,
  pageCount,
  lastScanLabel,
}: {
  pages: BoardPage[];
  siteCounts: SeverityCounts;
  pageCount: number;
  lastScanLabel: string;
}) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const page = focusId ? pages.find((p) => p.id === focusId) ?? null : null;

  const counts = page ? page.counts : siteCounts;

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
