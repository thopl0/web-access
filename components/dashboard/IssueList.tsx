"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronRight, EyeOff, Loader2, RotateCcw, X } from "lucide-react";

import { Section } from "@/components/dashboard/layout";
import { SeverityBadge, severityLabel } from "@/components/dashboard/severity";
import { ruleTitle } from "@/components/dashboard/IssueDetail";
import { setIssuesStatus } from "@/app/actions/issues";
import { type IssueRow } from "@/lib/server/issues";
import { type Severity } from "@/lib/severity";
import { cn } from "@/lib/utils";

function StatusTag({ issue }: { issue: IssueRow }) {
  if (issue.reopened) {
    return (
      <span className="rounded-full bg-pink/15 px-2 py-0.5 text-xs font-bold text-pink">
        Reopened
      </span>
    );
  }
  if (issue.status === "fixed") {
    return (
      <span className="rounded-full bg-green/15 px-2 py-0.5 text-xs font-bold text-green">
        Fixed (live)
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
 *
 * Each row has a checkbox; selecting one or many reveals a bulk action bar to turn issues off
 * (ignore / mark resolved) or reopen them — single is just a selection of one.
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
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const allKeys = issues.map((i) => i.key);
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selected.has(k));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(allKeys));
  const clear = () => setSelected(new Set());

  const apply = (status: "ignored" | "resolved" | "open") => {
    const keys = [...selected];
    if (keys.length === 0) return;
    startTransition(async () => {
      await setIssuesStatus(keys, status);
      clear();
      router.refresh(); // re-fetch so muted/reopened rows leave (or join) the current view
    });
  };

  const barBtn =
    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-bold transition-colors disabled:opacity-50";

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
      {/* Bulk action bar — appears once anything is selected. */}
      {selected.size > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-blue/40 bg-blue/5 px-3 py-2">
          <span className="text-sm font-bold text-fg">
            {selected.size} selected
          </span>
          {pending ? <Loader2 className="size-4 animate-spin text-fg-soft" aria-hidden /> : null}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => apply("ignored")}
              disabled={pending}
              className={cn(barBtn, "border-[var(--color-panel-line-strong)] text-fg-soft hover:text-fg")}
            >
              <EyeOff className="size-4" aria-hidden strokeWidth={2.25} />
              Ignore
            </button>
            <button
              type="button"
              onClick={() => apply("resolved")}
              disabled={pending}
              className={cn(barBtn, "border-green/50 text-green hover:bg-green/10")}
            >
              <CheckCircle2 className="size-4" aria-hidden strokeWidth={2.25} />
              Mark resolved
            </button>
            <button
              type="button"
              onClick={() => apply("open")}
              disabled={pending}
              className={cn(barBtn, "border-[var(--color-panel-line-strong)] text-fg-soft hover:text-fg")}
            >
              <RotateCcw className="size-4" aria-hidden strokeWidth={2.25} />
              Reopen
            </button>
            <button
              type="button"
              onClick={clear}
              disabled={pending}
              aria-label="Clear selection"
              className={cn(barBtn, "border-transparent text-fg-soft hover:text-fg")}
            >
              <X className="size-4" aria-hidden strokeWidth={2.25} />
            </button>
          </div>
        </div>
      ) : null}

      <ul className="overflow-hidden rounded-2xl border border-[var(--color-panel-line)] bg-surface shadow-[var(--panel-shadow)]">
        {/* Select-all header. */}
        <li className="flex items-center gap-3 border-b border-[var(--color-panel-line)] bg-[color-mix(in_srgb,var(--color-fg)_2%,transparent)] px-4 py-2 sm:px-5">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            aria-label={allSelected ? "Deselect all issues" : "Select all issues"}
            className="size-4 accent-[var(--color-blue)]"
          />
          <span className="text-xs font-bold uppercase tracking-wide text-fg-soft">
            {allSelected ? "All selected" : "Select all"}
          </span>
        </li>

        {issues.map((issue) => {
          const href = `/dashboard/issues/${encodeURIComponent(issue.key)}${
            fromSiteId ? `?from=${encodeURIComponent(fromSiteId)}` : ""
          }`;
          const isSel = selected.has(issue.key);
          return (
            <li
              key={issue.key}
              className={cn(
                "flex items-center border-b border-[var(--color-panel-line)] last:border-b-0",
                isSel ? "bg-blue/5" : "",
              )}
            >
              <label className="flex shrink-0 cursor-pointer items-center self-stretch pl-4 pr-1 sm:pl-5">
                <input
                  type="checkbox"
                  checked={isSel}
                  onChange={() => toggle(issue.key)}
                  aria-label={`Select "${ruleTitle(issue.ruleId, issue.message)}"`}
                  className="size-4 accent-[var(--color-blue)]"
                />
              </label>
              <Link
                href={href}
                className="group flex min-w-0 flex-1 items-center gap-4 py-3.5 pl-2 pr-4 no-underline transition-colors hover:bg-[color-mix(in_srgb,var(--color-fg)_4%,transparent)] sm:pr-5"
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
