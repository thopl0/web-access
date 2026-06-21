"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";

import { Panel } from "@/components/dashboard/ui";
import { SeverityBadge, SeverityDot, StatusChip } from "@/components/dashboard/severity";
import { IssueExplain, IssueElements, ruleTitle } from "@/components/dashboard/IssueDetail";
import { Badge } from "@/components/ui/Badge";
import { SEVERITY_ORDER, type Severity, type SeverityCounts } from "@/lib/severity";
import type { PageReport, RuleRollup } from "@/lib/server/report";

type Filter = Severity | "all";
type View = "issue" | "page";

const STATUS_FALLBACK = "surface" as const;

/** Chevron that rotates when its parent <details> is open. */
function Caret() {
  return (
    <ChevronDown
      className="size-4 shrink-0 text-fg-soft transition-transform group-open:rotate-180"
      aria-hidden
      strokeWidth={2.5}
    />
  );
}

/**
 * Link from a rolled-up rule into its full issue-detail page (where the fix + apply control live).
 * The key format matches SiteBoard.tsx (`${siteId}:${ruleId}`); `?from` lets the detail page send
 * the Back link to the right per-site list. Rendered only on the authenticated dashboard (siteId set).
 */
function OpenDetailsLink({ siteId, ruleId }: { siteId: string; ruleId: string }) {
  return (
    <Link
      href={`/dashboard/issues/${encodeURIComponent(`${siteId}:${ruleId}`)}?from=${encodeURIComponent(siteId)}`}
      className="inline-flex items-center gap-1.5 rounded-lg border border-blue/50 bg-blue/5 px-3 py-1.5 text-sm font-bold text-blue no-underline transition-colors hover:bg-blue/10"
    >
      Open details &amp; fix
      <ArrowRight className="size-4" aria-hidden strokeWidth={2.5} />
    </Link>
  );
}

/* ------------------------------------------------------------------ *
 * Control bar
 * ------------------------------------------------------------------ */
function FilterChip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-bold transition-colors",
        active
          ? "border-[var(--color-panel-line-strong)] bg-[color-mix(in_srgb,var(--color-fg)_8%,transparent)] text-fg"
          : "border-[var(--color-panel-line)] text-fg-soft hover:text-fg",
        disabled ? "cursor-not-allowed opacity-40 hover:text-fg-soft" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function ViewToggle({ view, setView }: { view: View; setView: (v: View) => void }) {
  const opt = (v: View, label: string) => (
    <button
      type="button"
      onClick={() => setView(v)}
      aria-pressed={view === v}
      className={[
        "rounded-md px-3 py-1.5 text-sm font-bold transition-colors",
        view === v ? "bg-surface text-fg shadow-sm" : "text-fg-soft hover:text-fg",
      ].join(" ")}
    >
      {label}
    </button>
  );
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-panel-line)] bg-[color-mix(in_srgb,var(--color-fg)_4%,transparent)] p-1">
      {opt("issue", "By issue type")}
      {opt("page", "By page")}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Issue-type (rule) view
 * ------------------------------------------------------------------ */
function RuleCard({
  rule,
  open,
  onToggle,
  siteId,
}: {
  rule: RuleRollup;
  open: boolean;
  onToggle: (open: boolean) => void;
  /** When present (authenticated dashboard), show the "Open details & fix" link. */
  siteId?: string;
}) {
  const title = ruleTitle(rule.ruleId, rule.message);
  return (
    <Panel as="li" className="!p-0">
      <details className="group" open={open} onToggle={(e) => onToggle(e.currentTarget.open)}>
        <summary className="flex cursor-pointer flex-wrap items-center gap-3 p-4 marker:content-none sm:p-5 [&::-webkit-details-marker]:hidden">
          <SeverityBadge severity={rule.impact} />
          <span className="font-display font-bold text-fg">{title}</span>
          <span className="ml-auto inline-flex items-center gap-3 whitespace-nowrap text-sm font-bold text-fg-soft">
            {rule.totalSpots} spot{rule.totalSpots === 1 ? "" : "s"} · {rule.pageCount} page
            {rule.pageCount === 1 ? "" : "s"}
            <Caret />
          </span>
        </summary>

        <div className="border-t border-[var(--color-panel-line)] p-4 sm:p-5">
          <IssueExplain
            ruleId={rule.ruleId}
            message={rule.message}
            wcag={rule.wcag}
            helpUrl={rule.helpUrl}
          />

          {siteId ? (
            <div className="mt-4">
              <OpenDetailsLink siteId={siteId} ruleId={rule.ruleId} />
            </div>
          ) : null}

          <p className="mt-5 text-xs font-bold uppercase tracking-wide text-fg-soft">
            Where it appears
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {rule.pages.map((p) => (
              <li key={p.url}>
                <details className="group/page inset overflow-hidden">
                  <summary className="flex cursor-pointer items-center gap-2 p-3 marker:content-none [&::-webkit-details-marker]:hidden">
                    <code className="break-all text-sm font-bold text-fg">{p.path}</code>
                    <span className="ml-auto inline-flex items-center gap-2 whitespace-nowrap text-xs font-bold text-fg-soft">
                      {p.elements.length} spot{p.elements.length === 1 ? "" : "s"}
                      <ChevronDown
                        className="size-4 transition-transform group-open/page:rotate-180"
                        aria-hidden
                        strokeWidth={2.5}
                      />
                    </span>
                  </summary>
                  <div className="border-t border-[var(--inset-line)] p-3">
                    <IssueElements
                      elements={p.elements}
                      grouped={p.grouped}
                      pageCount={p.pageCount}
                      keyPrefix={`${rule.ruleId}-${p.url}`}
                    />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </Panel>
  );
}

/* ------------------------------------------------------------------ *
 * Page view
 * ------------------------------------------------------------------ */
function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search || "/";
  } catch {
    return url;
  }
}

function PageRow({
  page,
  filter,
  open,
  onToggle,
  siteId,
}: {
  page: PageReport;
  filter: Filter;
  open: boolean;
  onToggle: (open: boolean) => void;
  /** When present (authenticated dashboard), show the "Open details & fix" link per rule. */
  siteId?: string;
}) {
  const groups =
    filter === "all" ? page.groups : page.groups.filter((g) => g.impact === filter);
  const shownTotal = groups.reduce((n, g) => n + g.elements.length, 0);

  return (
    <Panel as="li" className="!p-0">
      <details className="group" open={open} onToggle={(e) => onToggle(e.currentTarget.open)}>
        <summary className="flex cursor-pointer flex-wrap items-center gap-3 p-4 marker:content-none sm:p-5 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <code className="break-all font-display text-base font-bold text-fg">
                {pathOf(page.url)}
              </code>
              {page.grouped ? <Badge tone="blue">{page.pageCount} pages</Badge> : null}
              <StatusChip status={page.status ?? STATUS_FALLBACK} />
            </div>
          </div>
          <span className="ml-auto inline-flex items-center gap-3 whitespace-nowrap text-sm font-bold text-fg-soft">
            {shownTotal} spot{shownTotal === 1 ? "" : "s"}
            <Caret />
          </span>
        </summary>

        <div className="border-t border-[var(--color-panel-line)] p-4 sm:p-5">
          <p className="text-xs text-fg-soft break-all">{page.url}</p>
          {page.error ? (
            <p className="mt-3 rounded-lg border border-pink bg-pink/10 p-3 text-sm font-bold text-pink">
              Scan error: {page.error}
            </p>
          ) : null}

          {groups.length > 0 ? (
            <ul className="mt-4 flex flex-col gap-2">
              {groups.map((g) => (
                <li key={g.ruleId}>
                  <details className="group/issue inset overflow-hidden">
                    <summary className="flex cursor-pointer flex-wrap items-center gap-2 p-3 marker:content-none [&::-webkit-details-marker]:hidden">
                      <SeverityDot severity={(g.impact ?? "minor") as Severity} />
                      <span className="font-bold text-fg">{ruleTitle(g.ruleId, g.message)}</span>
                      <span className="ml-auto inline-flex items-center gap-2 whitespace-nowrap text-sm font-bold text-fg-soft">
                        {g.elements.length} spot{g.elements.length === 1 ? "" : "s"}
                        <ChevronDown
                          className="size-4 transition-transform group-open/issue:rotate-180"
                          aria-hidden
                          strokeWidth={2.5}
                        />
                      </span>
                    </summary>
                    <div className="border-t border-[var(--inset-line)] p-3">
                      <IssueExplain
                        ruleId={g.ruleId}
                        message={g.message}
                        wcag={g.wcag}
                        helpUrl={g.helpUrl}
                      />
                      {siteId ? (
                        <div className="mt-4">
                          <OpenDetailsLink siteId={siteId} ruleId={g.ruleId} />
                        </div>
                      ) : null}
                      <p className="mt-4 text-xs font-bold uppercase tracking-wide text-fg-soft">
                        Where it is on this page
                      </p>
                      <div className="mt-2">
                        <IssueElements
                          elements={g.elements}
                          grouped={page.grouped}
                          pageCount={page.pageCount}
                          keyPrefix={`${page.url}-${g.ruleId}`}
                        />
                      </div>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-fg-soft">No accessibility issues found here. 🎉</p>
          )}
        </div>
      </details>
    </Panel>
  );
}

/* ------------------------------------------------------------------ *
 * Orchestrator
 * ------------------------------------------------------------------ */
export function SiteReport({
  rules,
  pages,
  counts,
  siteId,
}: {
  rules: RuleRollup[];
  pages: PageReport[];
  counts: SeverityCounts;
  /** Authenticated dashboard only — enables the "Open details & fix" links into the issue-detail flow.
   *  Omitted on public share/scan pages, which don't link into the owner's dashboard. */
  siteId?: string;
}) {
  const [view, setView] = useState<View>("issue");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<Set<string>>(new Set());

  const setKeyOpen = (key: string, isOpen: boolean) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (isOpen) next.add(key);
      else next.delete(key);
      return next;
    });

  const visibleRules = useMemo(
    () => (filter === "all" ? rules : rules.filter((r) => r.impact === filter)),
    [rules, filter],
  );
  const visiblePages = useMemo(
    () =>
      filter === "all"
        ? pages.filter((p) => p.groups.length > 0)
        : pages.filter((p) => p.groups.some((g) => g.impact === filter)),
    [pages, filter],
  );

  const items = view === "issue" ? visibleRules : visiblePages;
  const keys =
    view === "issue"
      ? (visibleRules.map((r) => r.ruleId) as string[])
      : (visiblePages.map((p) => p.url) as string[]);
  const allOpen = keys.length > 0 && keys.every((k) => open.has(k));

  const toggleAll = () =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (allOpen) keys.forEach((k) => next.delete(k));
      else keys.forEach((k) => next.add(k));
      return next;
    });

  return (
    <div>
      {/* Control bar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by severity">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
            All <span className="tabular-nums opacity-70">{counts.total}</span>
          </FilterChip>
          {SEVERITY_ORDER.map((s) => (
            <FilterChip
              key={s}
              active={filter === s}
              disabled={counts[s] === 0}
              onClick={() => setFilter(s)}
            >
              <SeverityDot severity={s} />
              <span className="capitalize">{s}</span>
              <span className="tabular-nums opacity-70">{counts[s]}</span>
            </FilterChip>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 lg:justify-end">
          <ViewToggle view={view} setView={setView} />
        </div>
      </div>

      {/* Results header */}
      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-sm text-fg-soft">
          {view === "issue"
            ? `${items.length} issue type${items.length === 1 ? "" : "s"}`
            : `${items.length} page${items.length === 1 ? "" : "s"} with issues`}
          {filter !== "all" ? <span className="capitalize"> · {filter}</span> : null}
        </p>
        {items.length > 0 ? (
          <button
            type="button"
            onClick={toggleAll}
            className="text-sm font-bold text-link underline-offset-2 hover:underline"
          >
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <Panel className="mt-4">
          <p className="text-fg-soft">
            No <span className="font-bold text-fg capitalize">{filter}</span> issues. 🎉
          </p>
        </Panel>
      ) : view === "issue" ? (
        <ul className="mt-4 flex flex-col gap-3">
          {visibleRules.map((rule) => (
            <RuleCard
              key={rule.ruleId}
              rule={rule}
              open={open.has(rule.ruleId)}
              onToggle={(o) => setKeyOpen(rule.ruleId, o)}
              siteId={siteId}
            />
          ))}
        </ul>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {visiblePages.map((page) => (
            <PageRow
              key={page.url}
              page={page}
              filter={filter}
              open={open.has(page.url)}
              onToggle={(o) => setKeyOpen(page.url, o)}
              siteId={siteId}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
