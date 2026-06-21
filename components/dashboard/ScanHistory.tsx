import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Minus,
  PlusCircle,
  TrendingDown,
} from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/dashboard/ui";
import { ScoreBadge } from "@/components/dashboard/ScoreBadge";
import { SeverityBar, SeverityDot, StatusChip } from "@/components/dashboard/severity";
import type {
  DiffRule,
  ScanDiff,
  ScanSnapshot,
  SnapshotChange,
} from "@/lib/server/insights";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * Shared helpers
 * ------------------------------------------------------------------ */

const MICRO = "font-display text-sm font-bold uppercase tracking-wide text-fg-soft";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Momentum chip keyed to issue counts: more issues = worse (pink ↑), fewer =
 * better (green ↓). Honest direction — color is never the sole signal; the
 * arrow icon + the signed number both carry meaning.
 */
function IssueDelta({ delta }: { delta: number | null }) {
  if (delta === null) {
    return <span className="text-xs font-bold text-fg-soft">First scan</span>;
  }
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-fg-soft">
        <Minus className="size-3.5" aria-hidden strokeWidth={2.5} />
        No change
      </span>
    );
  }
  const worse = delta > 0;
  const Icon = worse ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-bold",
        worse ? "text-pink" : "text-green",
      )}
    >
      <Icon className="size-3.5" aria-hidden strokeWidth={2.5} />
      {worse ? "+" : "−"}
      {Math.abs(delta)} {Math.abs(delta) === 1 ? "issue" : "issues"}
      <span className="sr-only">{worse ? "more than" : "fewer than"} the previous scan</span>
    </span>
  );
}

/**
 * Quiet pill flagging a snapshot's scope: a full-site crawl vs a single-page spot check. Mirrors
 * the StatusChip pill so the timeline reads consistently. The label carries the meaning (no
 * color-only signal); it exists so a 1-page re-scan is never mistaken for a site-wide result.
 */
function ScopeChip({ isCrawl }: { isCrawl: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-panel-line-strong)] px-2.5 py-0.5 text-xs font-bold text-fg-soft">
      {isCrawl ? "Full crawl" : "Spot check · 1 page"}
    </span>
  );
}

/* How many rule titles to list inline per side before collapsing to "…and N more". */
const CHANGE_LIST_CAP = 4;

/**
 * Inline "what changed" for one timeline row vs the previous comparable scan (same scope). A compact
 * native <details> (keyboard-accessible, no client JS): the summary states "N new · N fixed" with
 * text-labelled, color-coded counts; expanding reveals the actual rule titles (via explainRule, carried
 * down as serializable props). Each rule links to its issue page, matching the compare tool's rows.
 */
function ChangeSummary({ change, siteId }: { change: SnapshotChange; siteId: string }) {
  if (!change.hasPrevious) {
    return <span className="text-xs font-bold text-fg-soft">First of its kind</span>;
  }

  const newCount = change.introduced.length;
  const fixedCount = change.resolved.length;
  if (newCount === 0 && fixedCount === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-fg-soft">
        <Minus className="size-3.5" aria-hidden strokeWidth={2.5} />
        No rules changed
      </span>
    );
  }

  return (
    <details className="group min-w-0">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-bold marker:content-none">
        {newCount > 0 ? (
          <span className="inline-flex items-center gap-1 text-pink">
            <PlusCircle className="size-3.5" aria-hidden strokeWidth={2.5} />
            {newCount} new
            <span className="sr-only">{newCount === 1 ? "rule" : "rules"} introduced</span>
          </span>
        ) : null}
        {fixedCount > 0 ? (
          <span className="inline-flex items-center gap-1 text-green">
            <CheckCircle2 className="size-3.5" aria-hidden strokeWidth={2.5} />
            {fixedCount} fixed
            <span className="sr-only">{fixedCount === 1 ? "rule" : "rules"} resolved</span>
          </span>
        ) : null}
        <span className="text-fg-soft transition-transform group-open:rotate-180" aria-hidden>
          ▾
        </span>
      </summary>
      <div className="mt-3 flex flex-col gap-3 text-sm">
        {newCount > 0 ? (
          <ChangeRuleList title="New issues" accent="pink" rules={change.introduced} siteId={siteId} />
        ) : null}
        {fixedCount > 0 ? (
          <ChangeRuleList title="Fixed" accent="green" rules={change.resolved} siteId={siteId} />
        ) : null}
      </div>
    </details>
  );
}

function ChangeRuleList({
  title,
  accent,
  rules,
  siteId,
}: {
  title: string;
  accent: "pink" | "green";
  rules: SnapshotChange["introduced"];
  siteId: string;
}) {
  const shown = rules.slice(0, CHANGE_LIST_CAP);
  const overflow = rules.length - shown.length;
  return (
    <div>
      <p
        className={cn(
          "font-display text-xs font-bold uppercase tracking-wide",
          accent === "pink" ? "text-pink" : "text-green",
        )}
      >
        {title}
      </p>
      <ul className="mt-1 flex flex-col gap-1">
        {shown.map((r) => (
          <li key={r.ruleId} className="flex items-start gap-2">
            <span className="mt-1">
              <SeverityDot severity={r.impact} />
            </span>
            <Link
              href={`/dashboard/issues/${encodeURIComponent(`${siteId}:${r.ruleId}`)}`}
              className="min-w-0 flex-1 font-bold text-fg no-underline underline-offset-2 hover:underline"
            >
              {r.title}
            </Link>
          </li>
        ))}
        {overflow > 0 ? (
          <li className="pl-[18px] text-xs text-fg-soft">…and {overflow} more</li>
        ) : null}
      </ul>
    </div>
  );
}

/* How many page paths to list inline before collapsing to "…and N more". */
const PAGE_LIST_CAP = 20;

/**
 * Which pages a scan covered — a quiet, secondary disclosure tucked under the row's meta line so it
 * never competes with the prominent "what changed" expander. The page count itself is the <details>
 * summary (keyboard-accessible, no client JS): expanding reveals the page paths (font-mono, muted,
 * mirroring the AffectedPages list). The "…and N more" tail uses the true `pageCount`, which may
 * exceed the carried `pages` list for large crawls. A single-page spot check has no list to reveal,
 * so the meta line already shows its one page — this renders nothing.
 */
function ScannedPages({ pages, pageCount }: { pages: string[]; pageCount: number }) {
  if (pages.length === 0 || pageCount === 1) return null;

  const shown = pages.slice(0, PAGE_LIST_CAP);
  const overflow = pageCount - shown.length;
  return (
    <details className="group/pages min-w-0">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-sm text-fg-soft underline-offset-2 marker:content-none hover:underline">
        {pageCount} {pageCount === 1 ? "page" : "pages"}
        <span
          className="text-fg-soft transition-transform group-open/pages:rotate-180"
          aria-hidden
        >
          ▾
        </span>
      </summary>
      <ul className="mt-2 flex flex-col gap-1">
        {shown.map((p) => (
          <li key={p} className="break-all font-mono text-sm text-fg-soft">
            {p}
          </li>
        ))}
        {overflow > 0 ? (
          <li className="text-xs text-fg-soft">
            …and {overflow} more {overflow === 1 ? "page" : "pages"}.
          </li>
        ) : null}
      </ul>
    </details>
  );
}

/* ------------------------------------------------------------------ *
 * Timeline — distinct vertical-rail layout (ordered list, newest first).
 * ------------------------------------------------------------------ */

export function ScanTimelineList({
  snapshots,
  changes,
  siteId,
}: {
  snapshots: ScanSnapshot[];
  changes: Record<string, SnapshotChange>;
  siteId: string;
}) {
  // snapshots are newest-first; the chronological predecessor of snapshot[i] is
  // snapshot[i + 1]. Issue-count delta vs that predecessor drives the momentum.
  return (
    <ol className="relative flex flex-col">
      {snapshots.map((snap, i) => {
        const prev = snapshots[i + 1]; // older scan
        const delta = prev ? snap.counts.total - prev.counts.total : null;
        const last = i === snapshots.length - 1;
        const dotTone =
          delta === null
            ? "bg-blue"
            : delta > 0
              ? "bg-pink"
              : delta < 0
                ? "bg-green"
                : "bg-[var(--color-fg-soft)]";

        return (
          <li key={snap.id} className="relative flex gap-4 pb-5 last:pb-0">
            {/* Rail + node */}
            <div className="relative flex w-4 shrink-0 justify-center" aria-hidden>
              {!last ? (
                <span className="absolute top-5 bottom-0 w-px bg-[var(--color-panel-line-strong)]" />
              ) : null}
              <span
                className={cn(
                  "relative z-10 mt-1.5 size-3.5 rounded-full ring-4 ring-[var(--color-bg)]",
                  dotTone,
                )}
              />
            </div>

            <Panel as="article" className="min-w-0 flex-1 !p-4 sm:!p-5">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-lg font-bold text-fg">{snap.label}</h3>
                    <ScopeChip isCrawl={snap.isCrawl} />
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-fg-soft">
                    <time dateTime={snap.createdAt}>{fmtDate(snap.createdAt)}</time>
                    <span aria-hidden>·</span>
                    {/* The page count doubles as the (quiet, secondary) "which pages" disclosure for
                        multi-page scans; single-page scans show the plain count inline. */}
                    {snap.pages.length > 0 && snap.pageCount > 1 ? (
                      <ScannedPages pages={snap.pages} pageCount={snap.pageCount} />
                    ) : (
                      <span>
                        {snap.pageCount} {snap.pageCount === 1 ? "page" : "pages"}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusChip status={snap.status} />
                  <ScoreBadge counts={snap.counts} pageCount={snap.pageCount} size="sm" />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <p className="text-sm text-fg-soft">
                  <span className="font-bold tabular-nums text-fg">{snap.counts.total}</span>{" "}
                  {snap.counts.total === 1 ? "issue" : "issues"}
                  {snap.counts.critical > 0 ? (
                    <>
                      {" · "}
                      <span className="font-bold text-pink">{snap.counts.critical} critical</span>
                    </>
                  ) : null}
                </p>
                <IssueDelta delta={delta} />
              </div>
              <div className="mt-2">
                <SeverityBar counts={snap.counts} muted={snap.status !== "complete"} />
              </div>

              {/* What changed vs the previous comparable (same-scope) scan — the row's one prominent
                  disclosure. "Which pages" lives quietly in the meta line above. */}
              <div className="mt-4 border-t border-[var(--color-panel-line)] pt-3">
                <ChangeSummary
                  change={changes[snap.id] ?? { hasPrevious: false, introduced: [], resolved: [] }}
                  siteId={siteId}
                />
              </div>
            </Panel>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ *
 * Diff — three prominent columns + quieter improved / unchanged.
 * ------------------------------------------------------------------ */

function DiffRow({ rule, siteId }: { rule: DiffRule; siteId: string }) {
  const arrow =
    rule.before === rule.after
      ? null
      : rule.after > rule.before
        ? "worse"
        : "better";
  return (
    <li className="border-b border-[var(--color-panel-line)] last:border-b-0">
      <Link
        href={`/dashboard/issues/${encodeURIComponent(`${siteId}:${rule.ruleId}`)}`}
        className="flex flex-col gap-2 py-2.5 no-underline transition-colors hover:bg-[color-mix(in_srgb,var(--color-fg)_4%,transparent)]"
      >
        <div className="flex items-start gap-2">
          <span className="mt-1">
            <SeverityDot severity={rule.impact} />
          </span>
          <span className="min-w-0 flex-1 text-sm font-bold text-fg">{rule.title}</span>
          <span
            className={cn(
              "shrink-0 text-xs font-bold tabular-nums",
              arrow === "worse" ? "text-pink" : arrow === "better" ? "text-green" : "text-fg-soft",
            )}
          >
            {rule.before}
            <ArrowRight className="mx-1 inline size-3 align-[-1px]" aria-hidden strokeWidth={2.5} />
            {rule.after}
            <span className="sr-only">
              {arrow === "worse"
                ? " spots — worse"
                : arrow === "better"
                  ? " spots — better"
                  : " spots — unchanged"}
            </span>
          </span>
        </div>
        {rule.wcag.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 pl-[18px]">
            {rule.wcag.map((w) => (
              <Badge key={w} tone="surface">
                WCAG {w}
              </Badge>
            ))}
          </div>
        ) : null}
      </Link>
    </li>
  );
}

function DiffColumn({
  title,
  icon,
  accent,
  rules,
  siteId,
  emptyMessage,
}: {
  title: string;
  icon: ReactNode;
  accent: "pink" | "green" | "neutral";
  rules: DiffRule[];
  siteId: string;
  emptyMessage: string;
}) {
  const tint =
    accent === "pink"
      ? "text-pink"
      : accent === "green"
        ? "text-green"
        : "text-fg-soft";
  return (
    <section className="flex flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--color-panel-line-strong)] pb-2">
        <h3 className="inline-flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-fg">
          <span className={tint} aria-hidden>
            {icon}
          </span>
          {title}
        </h3>
        <span className="rounded-full bg-[color-mix(in_srgb,var(--color-fg)_7%,transparent)] px-2 py-0.5 text-xs font-bold tabular-nums text-fg-soft">
          {rules.length}
        </span>
      </div>
      {rules.length === 0 ? (
        <p className="mt-3 text-sm text-fg-soft">{emptyMessage}</p>
      ) : (
        <ul className="mt-1 flex flex-col">
          {rules.map((r) => (
            <DiffRow key={r.ruleId} rule={r} siteId={siteId} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function ScanDiffView({ diff, siteId }: { diff: ScanDiff; siteId: string }) {
  const scoreDelta = diff.to.score - diff.from.score; // up = better (score)
  const better = scoreDelta > 0;
  const worse = scoreDelta < 0;
  // Comparing a full crawl against a single-page spot check spans different page sets, so a big
  // "fixed" delta can just be the narrower scan looking at fewer pages. Annotate, don't block.
  const crossScope = diff.from.isCrawl !== diff.to.isCrawl;

  return (
    <div className="flex flex-col gap-8">
      {/* Diff header: from → to + score change */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-b border-[var(--color-panel-line-strong)] pb-5">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-fg">
          <span className={MICRO}>From</span>
          <span className="font-display font-bold">{diff.from.label}</span>
          <ArrowRight className="size-4 shrink-0 text-fg-soft" aria-hidden strokeWidth={2.5} />
          <span className="font-display font-bold">{diff.to.label}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="font-display text-xl font-bold tabular-nums text-fg">
              {diff.from.score}
              <span className="mx-1.5 text-fg-soft" aria-hidden>
                →
              </span>
              {diff.to.score}
            </p>
            <p className="text-xs text-fg-soft">Accessibility score</p>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold",
              better
                ? "border-green text-green"
                : worse
                  ? "border-pink text-pink"
                  : "border-[var(--color-panel-line-strong)] text-fg-soft",
            )}
          >
            {better ? (
              <ArrowUpRight className="size-3.5" aria-hidden strokeWidth={2.5} />
            ) : worse ? (
              <ArrowDownRight className="size-3.5" aria-hidden strokeWidth={2.5} />
            ) : (
              <Minus className="size-3.5" aria-hidden strokeWidth={2.5} />
            )}
            {scoreDelta === 0 ? "No change" : `${better ? "+" : "−"}${Math.abs(scoreDelta)} pts`}
            <span className="sr-only">{better ? "improved" : worse ? "declined" : ""}</span>
          </span>
        </div>
      </div>

      {crossScope ? (
        <p className="-mt-4 text-xs text-fg-soft">
          Heads up: these scans cover different page sets — one is a full crawl, the other a
          single-page spot check. A large change here may just reflect the smaller scan, not work
          done.
        </p>
      ) : null}

      {/* Three prominent columns */}
      <div className="grid gap-8 lg:grid-cols-3">
        <DiffColumn
          title="New issues"
          icon={<PlusCircle className="size-4" strokeWidth={2.5} />}
          accent="pink"
          rules={diff.added}
          siteId={siteId}
          emptyMessage="No new issues — nothing regressed into existence. 🎉"
        />
        <DiffColumn
          title="Fixed"
          icon={<CheckCircle2 className="size-4" strokeWidth={2.5} />}
          accent="green"
          rules={diff.fixed}
          siteId={siteId}
          emptyMessage="No issues cleared in this span yet."
        />
        <DiffColumn
          title="Regressions"
          icon={<TrendingDown className="size-4" strokeWidth={2.5} />}
          accent="pink"
          rules={diff.regressed}
          siteId={siteId}
          emptyMessage="No regressions — existing issues held steady or improved. 🎉"
        />
      </div>

      {/* Quieter: improved */}
      {diff.improved.length > 0 ? (
        <DiffColumn
          title="Improved"
          icon={<ArrowDownRight className="size-4" strokeWidth={2.5} />}
          accent="green"
          rules={diff.improved}
          siteId={siteId}
          emptyMessage=""
        />
      ) : null}

      {/* Collapsible: unchanged (native <details>, no client JS) */}
      {diff.unchanged.length > 0 ? (
        <section className="border-t border-[var(--color-panel-line-strong)] pt-5">
          <details className="group">
            <summary className="flex cursor-pointer items-center justify-between gap-2 font-display text-sm font-bold uppercase tracking-wide text-fg-soft marker:content-none">
              <span className="inline-flex items-center gap-2">
                Unchanged
                <span className="rounded-full bg-[color-mix(in_srgb,var(--color-fg)_7%,transparent)] px-2 py-0.5 text-xs font-bold tabular-nums">
                  {diff.unchanged.length}
                </span>
              </span>
              <span className="text-fg-soft transition-transform group-open:rotate-180" aria-hidden>
                ▾
              </span>
            </summary>
            <ul className="mt-2 grid gap-x-8 sm:grid-cols-2">
              {diff.unchanged.map((r) => (
                <DiffRow key={r.ruleId} rule={r} siteId={siteId} />
              ))}
            </ul>
          </details>
        </section>
      ) : null}
    </div>
  );
}
