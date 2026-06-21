import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { Inbox } from "lucide-react";

import { CodeChip, EmptyState, PageHeader } from "@/components/dashboard/ui";
import { PageShell, MetricStrip, type Metric } from "@/components/dashboard/layout";
import { SiteStatusChip } from "@/components/dashboard/SiteStatusChip";
import { IssueList } from "@/components/dashboard/IssueList";
import { verifySession } from "@/lib/server/dal";
import { db, schema } from "@/lib/server/db";
import { getUserIssues } from "@/lib/server/issues";
import { SEVERITY_ORDER, type Severity } from "@/lib/severity";

export const metadata: Metadata = { title: "Issues" };
export const dynamic = "force-dynamic";

export default async function SiteIssuesPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ view?: string; severity?: string }>;
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

  const sp = await searchParams;
  const view = sp.view === "muted" || sp.view === "all" ? sp.view : "open";
  const severity =
    sp.severity && (SEVERITY_ORDER as readonly string[]).includes(sp.severity)
      ? (sp.severity as Severity)
      : undefined;

  const issues = await getUserIssues(userId, { view, severity, siteId });

  // Summary derived from the rows currently in view — one calm scorecard band.
  const open = issues.filter((i) => i.status === "open").length;
  const critical = issues.filter((i) => i.impact === "critical").length;
  const serious = issues.filter((i) => i.impact === "serious").length;
  const metrics: Metric[] = [
    { label: "Showing", value: issues.length, hint: view === "open" ? "Open issues" : view === "muted" ? "Resolved / ignored" : "All issues" },
    { label: "Open", value: open },
    { label: "Critical", value: critical, ...(critical > 0 ? { severity: "critical" as const } : {}) },
    { label: "Serious", value: serious, ...(serious > 0 ? { severity: "serious" as const } : {}) },
  ];

  return (
    <PageShell>
      <PageHeader
        titleId="issues-title"
        eyebrow="Inbox"
        title={site.name}
        lead={
          <span className="inline-flex flex-wrap items-center gap-3">
            <SiteStatusChip status={site.status} />
            <span className="inline-flex items-center gap-1.5 text-fg-soft">
              Site ID <CodeChip>{site.id}</CodeChip>
            </span>
          </span>
        }
      />

      {issues.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={<Inbox className="size-6" aria-hidden strokeWidth={2} />}
          title={view === "open" ? "Inbox zero 🎉" : "Nothing here"}
        >
          {view === "open"
            ? "No open issues for this site. Nice."
            : "No issues match this view."}
        </EmptyState>
      ) : (
        <>
          {/* Slim scorecard reflecting this site's set. */}
          <div className="mt-6">
            <MetricStrip items={metrics} />
          </div>

          {/* The inbox: one calm table, hairline-separated rows. */}
          <IssueList issues={issues} className="mt-8" fromSiteId={siteId} />
        </>
      )}
    </PageShell>
  );
}
