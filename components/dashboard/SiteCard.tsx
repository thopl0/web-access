import Link from "next/link";
import { ArrowRight, ChevronDown, ExternalLink } from "lucide-react";

import type { SiteStatus } from "@web-access/shared";
import { Button } from "@/components/ui/Button";
import { EmbedSnippet } from "@/components/dashboard/EmbedSnippet";
import { VerifyPanel } from "@/components/dashboard/VerifyPanel";
import { SiteStatusChip } from "@/components/dashboard/SiteStatusChip";
import { ScoreBadge } from "@/components/dashboard/ScoreBadge";
import { Panel, CodeChip } from "@/components/dashboard/ui";
import {
  SeverityBar,
  SeverityDot,
  StatusChip,
  severityLabel,
} from "@/components/dashboard/severity";
import { SEVERITY_ORDER, type SiteSummary } from "@/lib/server/report";

/** Compact "last scanned" line — date only; the detail view has the precise time. */
function formatScanned(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function SiteCard({
  site,
  summary,
  snippet,
}: {
  site: { id: string; name: string; origin: string | null; status: SiteStatus };
  summary: SiteSummary;
  snippet: string;
}) {
  const reportHref = `/dashboard/${site.id}`;
  const scanned = summary.pageCount > 0;
  const verified = site.status === "verified";

  return (
    <Panel as="li">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-xl font-bold leading-tight">
            <Link href={reportHref} className="text-fg no-underline hover:underline underline-offset-4">
              {site.name}
            </Link>
          </h3>
          {site.origin ? (
            <a
              href={site.origin}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-sm text-fg-soft no-underline hover:text-fg break-all"
            >
              {site.origin.replace(/^https?:\/\//, "")}
              <ExternalLink className="size-3 shrink-0" aria-hidden strokeWidth={2.5} />
            </a>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {verified && scanned ? (
            <ScoreBadge counts={summary.counts} pageCount={summary.pageCount} size="sm" />
          ) : null}
          <SiteStatusChip status={site.status} />
          {verified ? <StatusChip status={summary.status} /> : null}
        </div>
      </div>

      {/* Not verified yet: lead with finishing setup, not an empty posture. */}
      {!verified ? (
        <div className="mt-5 flex flex-col gap-4 border-t border-[var(--color-panel-line)] pt-5">
          <p className="text-sm text-fg-soft">
            Finish setup: add the snippet to your site&apos;s <code className="font-mono text-xs">&lt;head&gt;</code>, then verify.
          </p>
          <EmbedSnippet snippet={snippet} />
          <VerifyPanel siteId={site.id} initialStatus={site.status} hasOrigin={!!site.origin} />
        </div>
      ) : (
      /* At-a-glance posture */
      <div className="mt-5">
        <SeverityBar counts={summary.counts} muted={!scanned} />
        {scanned ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="font-bold text-fg">
              {summary.counts.total} {summary.counts.total === 1 ? "issue" : "issues"}
            </span>
            {SEVERITY_ORDER.filter((s) => summary.counts[s] > 0).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5 text-fg-soft">
                <SeverityDot severity={s} />
                {summary.counts[s]} {severityLabel(s).toLowerCase()}
              </span>
            ))}
            {summary.counts.total === 0 ? (
              <span className="text-fg-soft">No issues found 🎉</span>
            ) : null}
            <span className="text-fg-soft">
              · {summary.pageCount} {summary.pageCount === 1 ? "page" : "pages"}
            </span>
            {summary.lastScannedAt ? (
              <span className="text-fg-soft">· scanned {formatScanned(summary.lastScannedAt)}</span>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-fg-soft">
            No scans yet. Add the snippet below to your site — scans appear here automatically.
          </p>
        )}
      </div>
      )}

      {/* Meta + primary action */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-panel-line)] pt-5">
        <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-fg-soft">
          Site ID
          <CodeChip>{site.id}</CodeChip>
        </span>
        <Button href={reportHref} variant="outline" size="sm">
          View reports
          <ArrowRight className="size-4" aria-hidden strokeWidth={2.5} />
        </Button>
      </div>

      {/* Embed snippet — tucked away once a site is live (shown openly above while pending). */}
      {verified ? (
        <details className="group mt-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-fg-soft marker:content-none hover:text-fg [&::-webkit-details-marker]:hidden">
            <ChevronDown
              className="size-4 transition-transform group-open:rotate-180"
              aria-hidden
              strokeWidth={2.5}
            />
            Embed snippet
          </summary>
          <div className="mt-3">
            <EmbedSnippet snippet={snippet} />
          </div>
        </details>
      ) : null}
    </Panel>
  );
}
