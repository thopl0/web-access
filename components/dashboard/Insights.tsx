import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

import { ruleTitle } from "@/components/dashboard/IssueDetail";
import { SeverityBadge } from "@/components/dashboard/severity";
import { effortOf } from "@/lib/effort";
import { SEVERITY_RANK, type Severity } from "@/lib/severity";
import type { IssueRow } from "@/lib/server/issues";

const issueHref = (key: string) => `/dashboard/issues/${encodeURIComponent(key)}`;

/**
 * Quick wins: easy-to-fix issues that still carry real impact (critical / serious / moderate),
 * worst-first. Gives a non-technical owner an obvious place to start. Pure/server-safe.
 */
export function QuickWins({ issues }: { issues: IssueRow[] }) {
  const wins = issues
    .filter((i) => {
      if (effortOf(i.ruleId) !== "easy" || !i.impact) return false;
      return SEVERITY_RANK[i.impact as Severity] <= 2; // critical/serious/moderate
    })
    .sort((a, b) => {
      const ra = SEVERITY_RANK[a.impact as Severity];
      const rb = SEVERITY_RANK[b.impact as Severity];
      return ra - rb || b.totalSpots - a.totalSpots;
    })
    .slice(0, 5);

  return (
    <div>
      <h2 className="mb-1 flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-fg-soft">
        <Sparkles className="size-4 text-blue" aria-hidden />
        Quick wins
      </h2>
      <p className="mb-4 text-sm text-fg-soft">High-impact issues that are quick to fix.</p>

      {wins.length === 0 ? (
        <p className="text-sm text-fg-soft">No quick wins right now — nice work.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {wins.map((w) => (
            <li key={w.key}>
              <Link
                href={issueHref(w.key)}
                className="panel panel-link flex items-center gap-3 p-3 no-underline"
              >
                <SeverityBadge severity={w.impact as Severity | null} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-fg">
                    {ruleTitle(w.ruleId, w.message)}
                  </span>
                  <span className="text-xs text-fg-soft">
                    {w.siteName} · {w.totalSpots} {w.totalSpots === 1 ? "spot" : "spots"}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-blue/15 px-2 py-0.5 text-xs font-bold text-blue">
                  Quick fix
                </span>
                <ArrowRight className="size-4 shrink-0 text-fg-soft" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type CommonRow = {
  ruleId: string;
  message: string;
  impact: IssueRow["impact"];
  spots: number;
  sites: Set<string>;
};

/** Most common issues by total occurrences (a frequency bar across all sites). Pure/server-safe. */
export function CommonIssues({ issues }: { issues: IssueRow[] }) {
  const byRule = new Map<string, CommonRow>();
  for (const i of issues) {
    let row = byRule.get(i.ruleId);
    if (!row) {
      row = { ruleId: i.ruleId, message: i.message, impact: i.impact, spots: 0, sites: new Set() };
      byRule.set(i.ruleId, row);
    }
    row.spots += i.totalSpots;
    row.sites.add(i.siteId);
  }
  const common = [...byRule.values()].sort((a, b) => b.spots - a.spots).slice(0, 5);
  const max = common[0]?.spots ?? 1;

  return (
    <div>
      <h2 className="mb-4 font-display text-sm font-bold uppercase tracking-wide text-fg-soft">
        Most common issues
      </h2>
      {common.length === 0 ? (
        <p className="text-sm text-fg-soft">No open issues. 🎉</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {common.map((r) => (
            <li key={r.ruleId} className="flex items-center gap-3">
              <span className="w-40 shrink-0 truncate text-sm font-bold text-fg" title={ruleTitle(r.ruleId, r.message)}>
                {ruleTitle(r.ruleId, r.message)}
              </span>
              <span
                aria-hidden
                className="h-2 flex-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--color-fg)_8%,transparent)]"
              >
                <span className="block h-full bg-blue" style={{ width: `${Math.max((r.spots / max) * 100, 6)}%` }} />
              </span>
              <span className="w-14 shrink-0 text-right text-sm tabular-nums text-fg-soft">
                {r.spots}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
