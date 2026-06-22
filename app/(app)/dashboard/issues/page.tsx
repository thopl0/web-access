import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { Inbox } from "lucide-react";

import { EmptyState, PageHeader } from "@/components/dashboard/ui";
import { PageShell, MetricStrip, type Metric } from "@/components/dashboard/layout";
import { IssueFilters } from "@/components/dashboard/IssueFilters";
import { IssueList } from "@/components/dashboard/IssueList";
import { verifySession } from "@/lib/server/dal";
import { db, schema } from "@/lib/server/db";
import { getUserIssues } from "@/lib/server/issues";
import { SEVERITY_ORDER, type Severity } from "@/lib/severity";

export const metadata: Metadata = { title: "Issues" };
export const dynamic = "force-dynamic";

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; severity?: string; site?: string }>;
}) {
  const { userId } = await verifySession();
  const sp = await searchParams;

  const view =
    sp.view === "muted" || sp.view === "fixed" || sp.view === "all" ? sp.view : "open";
  const severity =
    sp.severity && (SEVERITY_ORDER as readonly string[]).includes(sp.severity)
      ? (sp.severity as Severity)
      : undefined;
  const siteId = sp.site || undefined;

  const [issues, sites] = await Promise.all([
    getUserIssues(userId, { view, severity, siteId }),
    db
      .select({ id: schema.sites.id, name: schema.sites.name })
      .from(schema.sites)
      .where(eq(schema.sites.ownerId, userId))
      .orderBy(desc(schema.sites.createdAt)),
  ]);

  const hasSites = sites.length > 0;

  // Summary derived from the rows currently in view — one calm scorecard band.
  const open = issues.filter((i) => i.status === "open").length;
  const critical = issues.filter((i) => i.impact === "critical").length;
  const serious = issues.filter((i) => i.impact === "serious").length;
  const metrics: Metric[] = [
    { label: "Showing", value: issues.length, hint: view === "open" ? "Open issues" : view === "fixed" ? "Auto-fixed" : view === "muted" ? "Resolved / ignored" : "All issues" },
    { label: "Open", value: open },
    { label: "Critical", value: critical, ...(critical > 0 ? { severity: "critical" as const } : {}) },
    { label: "Serious", value: serious, ...(serious > 0 ? { severity: "serious" as const } : {}) },
  ];

  return (
    <PageShell>
      <PageHeader
        titleId="issues-title"
        eyebrow="Inbox"
        title="Issues"
        lead="Every accessibility issue across your sites, worst first. Resolve, ignore, or open one for the fix."
      />

      {!hasSites ? (
        <EmptyState
          className="mt-8"
          icon={<Inbox className="size-6" aria-hidden strokeWidth={2} />}
          title="No sites yet"
        >
          Add a site and once it&apos;s scanned, its issues collect here.
        </EmptyState>
      ) : (
        <>
          {/* One quiet control row for all filters. */}
          <div className="mt-6">
            <IssueFilters sites={sites} />
          </div>

          {issues.length === 0 ? (
            <EmptyState
              className="mt-8"
              icon={<Inbox className="size-6" aria-hidden strokeWidth={2} />}
              title={view === "open" ? "Inbox zero 🎉" : "Nothing here"}
            >
              {view === "open"
                ? "No open issues match these filters. Nice."
                : "No issues match these filters."}
            </EmptyState>
          ) : (
            <>
              {/* Slim scorecard reflecting the filtered set. */}
              <div className="mt-6">
                <MetricStrip items={metrics} />
              </div>

              {/* The inbox: one calm table, hairline-separated rows. */}
              <IssueList issues={issues} className="mt-8" />
            </>
          )}
        </>
      )}
    </PageShell>
  );
}
