import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Section } from "@/components/dashboard/layout";
import { SeverityBadge, severityLabel } from "@/components/dashboard/severity";
import { ruleTitle } from "@/components/dashboard/IssueDetail";
import { type IssueRow } from "@/lib/server/issues";
import { type Severity } from "@/lib/severity";

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

/**
 * The inbox list of issues — one calm table, hairline-separated rows. Shared by the global Issues
 * inbox and the per-site Issues tab. Rows link to the detail route; pass `fromSiteId` to add a
 * `?from=` param so the detail page's Back button can return to that site.
 */
export function IssueList({
  issues,
  className,
  fromSiteId,
}: {
  issues: IssueRow[];
  className?: string;
  fromSiteId?: string;
}) {
  return (
    <Section
      title="Issues"
      action={
        <span className="text-sm text-fg-soft">
          {issues.length} {issues.length === 1 ? "issue" : "issues"}
        </span>
      }
      className={className}
    >
      <ul className="overflow-hidden rounded-2xl border border-[var(--color-panel-line)] bg-surface shadow-[var(--panel-shadow)]">
        {issues.map((issue) => {
          const href = `/dashboard/issues/${encodeURIComponent(issue.key)}${
            fromSiteId ? `?from=${encodeURIComponent(fromSiteId)}` : ""
          }`;
          return (
            <li
              key={issue.key}
              className="border-b border-[var(--color-panel-line)] last:border-b-0"
            >
              <Link
                href={href}
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
          );
        })}
      </ul>
    </Section>
  );
}
