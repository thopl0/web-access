import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ChevronRight, Inbox } from "lucide-react";

import { EmptyState, PageHeader } from "@/components/dashboard/ui";
import { PageShell, Section, MetricStrip, type Metric } from "@/components/dashboard/layout";
import { IssueFilters } from "@/components/dashboard/IssueFilters";
import { SeverityBadge, severityLabel } from "@/components/dashboard/severity";
import { ruleTitle } from "@/components/dashboard/IssueDetail";
import { verifySession } from "@/lib/server/dal";
import { db, schema } from "@/lib/server/db";
import { getUserIssues, type IssueRow } from "@/lib/server/issues";
import { SEVERITY_ORDER, type Severity } from "@/lib/severity";

export const metadata: Metadata = { title: "Issues" };
export const dynamic = "force-dynamic";

function StatusTag({ issue }: { issue: IssueRow }) {
  if (issue.reopened) {
    return (
      <span className="rounded-full bg-pink/15 px-2 py-0.5 text-xs font-bold text-pink">
        Reopened
      </span>
    );
  }
  if (issue.status === "resolved") {
    return (
      <span className="rounded-full bg-green/15 px-2 py-0.5 text-xs font-bold text-green">
        Resolved
      </span>
    );
  }
  if (issue.status === "ignored" || issue.status === "snoozed") {
    return (
      <span className="rounded-full bg-[color-mix(in_srgb,var(--color-fg)_8%,transparent)] px-2 py-0.5 text-xs font-bold text-fg-soft">
        {issue.status === "snoozed" ? "Snoozed" : "Ignored"}
      </span>
    );
  }
  return null;
}

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; severity?: string; site?: string }>;
}) {
  const { userId } = await verifySession();
  const sp = await searchParams;

  const view = sp.view === "muted" || sp.view === "all" ? sp.view : "open";
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
              <Section
                title="Issues"
                action={
                  <span className="text-sm text-fg-soft">
                    {issues.length} {issues.length === 1 ? "issue" : "issues"}
                  </span>
                }
                className="mt-8"
              >
                <ul className="overflow-hidden rounded-2xl border border-[var(--color-panel-line)] bg-surface shadow-[var(--panel-shadow)]">
                  {issues.map((issue) => (
                    <li
                      key={issue.key}
                      className="border-b border-[var(--color-panel-line)] last:border-b-0"
                    >
                      <Link
                        href={`/dashboard/issues/${encodeURIComponent(issue.key)}`}
                        className="group flex items-center gap-4 px-4 py-3.5 no-underline transition-colors hover:bg-[color-mix(in_srgb,var(--color-fg)_4%,transparent)] sm:px-5"
                      >
                        <div className="w-[88px] shrink-0">
                          <SeverityBadge severity={issue.impact as Severity | null} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-display font-bold text-fg">
                              {ruleTitle(issue.ruleId, issue.message)}
                            </p>
                            <StatusTag issue={issue} />
                          </div>
                          <p className="mt-0.5 text-sm text-fg-soft">
                            {issue.siteName} · {issue.totalSpots}{" "}
                            {issue.totalSpots === 1 ? "spot" : "spots"} on {issue.pageCount}{" "}
                            {issue.pageCount === 1 ? "page" : "pages"}
                            {issue.impact ? ` · ${severityLabel(issue.impact as Severity)}` : ""}
                          </p>
                        </div>
                        <ChevronRight
                          className="size-5 shrink-0 text-fg-soft transition-colors group-hover:text-fg"
                          aria-hidden
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Section>
            </>
          )}
        </>
      )}
    </PageShell>
  );
}
