import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ExternalLink, FileSearch } from "lucide-react";

import { CodeChip, EmptyState, PageHeader } from "@/components/dashboard/ui";
import { PageShell, Section } from "@/components/dashboard/layout";
import { RecrawlButton, RescanButton } from "@/components/dashboard/PageActions";
import { SeverityBar, SeverityDot, StatusChip, severityLabel } from "@/components/dashboard/severity";
import { verifySession } from "@/lib/server/dal";
import { db, schema } from "@/lib/server/db";
import { getSitePages, pathOf } from "@/lib/server/report";
import { SEVERITY_ORDER } from "@/lib/severity";

export const metadata: Metadata = { title: "Pages" };
export const dynamic = "force-dynamic";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function SitePagesPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const { userId } = await verifySession();

  const owned = await db
    .select()
    .from(schema.sites)
    .where(and(eq(schema.sites.id, siteId), eq(schema.sites.ownerId, userId)))
    .limit(1);
  const site = owned[0];
  if (!site) notFound();

  // List view only needs counts, so skip the heavy evidence join.
  const { pages } = await getSitePages(siteId, { evidence: false });

  return (
    <PageShell>
      <PageHeader
        titleId="pages-title"
        eyebrow="Your pages"
        title={site.name}
        lead={
          site.origin ? (
            <a
              href={site.origin}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 break-all font-bold text-link no-underline underline-offset-2 hover:underline"
            >
              {site.origin.replace(/^https?:\/\//, "")}
              <ExternalLink className="size-3.5 shrink-0" aria-hidden strokeWidth={2.5} />
            </a>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              Site ID <CodeChip>{site.id}</CodeChip>
            </span>
          )
        }
        actions={<RecrawlButton siteId={siteId} />}
      />

      <p className="mt-3 text-sm text-fg-soft">
        A crawl finds your pages; a scan checks each one for problems.
      </p>

      {pages.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={<FileSearch className="size-6" aria-hidden strokeWidth={2} />}
          title="No pages monitored yet"
        >
          Once the embed runs — or after a crawl — the pages we&apos;re watching show up here. Use
          Find new pages to discover them now.
        </EmptyState>
      ) : (
        <Section
          title="Pages"
          action={
            <span className="text-sm text-fg-soft">
              {pages.length} {pages.length === 1 ? "page" : "pages"}
            </span>
          }
          className="mt-8"
        >
          <ul className="overflow-hidden rounded-2xl border border-[var(--color-panel-line)] bg-surface shadow-[var(--panel-shadow)]">
            {pages.map((p) => (
              <li
                key={p.url}
                className="border-b border-[var(--color-panel-line)] px-4 py-4 last:border-b-0 sm:px-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-all font-display font-bold text-fg">
                      {pathOf(p.url)}
                      {p.grouped ? (
                        <span className="ml-2 text-xs font-normal text-fg-soft">
                          {p.pageCount} similar pages
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs text-fg-soft">
                      Scanned {fmtDate(p.scannedAt)} · {p.totalScans}{" "}
                      {p.totalScans === 1 ? "scan" : "scans"}
                      {p.pending > 0 ? ` · ${p.pending} pending` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusChip status={p.status} />
                    {!p.grouped ? <RescanButton siteId={siteId} url={p.url} /> : null}
                  </div>
                </div>

                <div className="mt-3">
                  <SeverityBar
                    counts={p.counts}
                    muted={p.counts.total === 0 && p.status !== "complete"}
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="font-bold text-fg">
                      {p.counts.total} {p.counts.total === 1 ? "issue" : "issues"}
                    </span>
                    {SEVERITY_ORDER.filter((s) => p.counts[s] > 0).map((s) => (
                      <span key={s} className="inline-flex items-center gap-1.5 text-fg-soft">
                        <SeverityDot severity={s} />
                        {p.counts[s]} {severityLabel(s).toLowerCase()}
                      </span>
                    ))}
                    {p.counts.total === 0 && p.status === "complete" ? (
                      <span className="text-fg-soft">No issues 🎉</span>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </PageShell>
  );
}
