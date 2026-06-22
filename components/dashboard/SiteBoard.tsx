"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ExternalLink, ImageOff, Maximize2, ScanLine } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Severity, SeverityCounts } from "@/lib/severity";
import { grade, healthScore } from "@/lib/score";

/**
 * "Your site, laid bare" — the centerpiece. A wall of every scanned page rendered as its real
 * full-page screenshot, with the accessibility problems pinned exactly where they are (markers
 * positioned in % of the shot's coordinate space, colored by severity). Click a page to drop into
 * a focused view: the page large, every issue highlighted, listed beside it, with prev/next to
 * walk the site. Selecting an issue pinpoints its spots ON the screenshot (and scrolls to them).
 *
 * The focus view is synced to browser history (a pushState entry) so the Back button closes it
 * instead of leaving the page. All data is pre-resolved on the server (screenshots base64, boxes
 * mapped), so this is pure presentation; it degrades gracefully when screenshots aren't captured.
 */

export type BoardMarker = {
  ruleId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  impact: Severity;
  title: string;
};

export type BoardPage = {
  id: string;
  path: string;
  siteId: string;
  counts: SeverityCounts;
  /** Issue counts by severity (not spots) — for the "severity breakdown" donut when this page is focused. */
  typeCounts: SeverityCounts;
  shot?: { src: string; width: number; height: number };
  markers: BoardMarker[];
  issues: { ruleId: string; title: string; impact: Severity | null; count: number }[];
  grouped: boolean;
  pageCount: number;
  status: string;
};

const SEV_RING: Record<Severity, string> = {
  critical: "ring-pink",
  serious: "ring-yellow",
  moderate: "ring-blue",
  minor: "ring-[var(--color-fg-soft)]",
};
const SEV_BG: Record<Severity, string> = {
  critical: "bg-pink",
  serious: "bg-yellow",
  moderate: "bg-blue",
  minor: "bg-[var(--color-fg-soft)]",
};
const SEV_TEXT: Record<Severity, string> = {
  critical: "text-pink",
  serious: "text-[color-mix(in_srgb,var(--color-fg)_55%,var(--yellow))]",
  moderate: "text-blue",
  minor: "text-fg-soft",
};
const GRADE_RING: Record<"green" | "yellow" | "pink", string> = {
  green: "border-green text-green",
  yellow: "border-yellow text-[color-mix(in_srgb,var(--color-fg)_55%,var(--yellow))]",
  pink: "border-pink text-pink",
};

function pct(n: number, total: number) {
  return `${Math.max(0, Math.min(100, (n / total) * 100))}%`;
}

function ScorePill({ counts }: { counts: SeverityCounts }) {
  const score = healthScore(counts, 1);
  const g = grade(score);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border-2 bg-surface/90 px-2 py-0.5 text-xs font-bold backdrop-blur",
        GRADE_RING[g.tone],
      )}
      title={`Accessibility score ${score}/100`}
    >
      <span className="font-display">{g.letter}</span>
      <span className="tabular-nums">{score}</span>
    </span>
  );
}

/** The screenshot with its markers overlaid. In `detail` mode markers are interactive and respond
 *  to `activeRule` (matching ones emphasized, the rest dimmed). */
function ShotWithMarkers({
  page,
  detail = false,
  activeRule = null,
  onSelectRule,
}: {
  page: BoardPage;
  detail?: boolean;
  activeRule?: string | null;
  onSelectRule?: (ruleId: string) => void;
}) {
  if (!page.shot) {
    return (
      <div className="flex h-full min-h-40 w-full flex-col items-center justify-center gap-2 bg-[color-mix(in_srgb,var(--color-fg)_3%,transparent)] px-4 py-8 text-center">
        <ImageOff className="size-6 text-fg-soft" aria-hidden strokeWidth={2} />
        <p className="text-xs font-bold text-fg-soft">Screenshot pending</p>
        <p className="max-w-[16rem] text-[11px] text-fg-soft">Captured on the next scan of this page.</p>
      </div>
    );
  }
  const shot = page.shot;
  // The image defines the box (w-full, natural height); markers are positioned as % of THIS wrapper,
  // so they always line up with the rendered pixels. A tile clips to a fixed height (top of page);
  // the detail view lets its parent scroll the full height. (object-contain/max-h would letterbox a
  // tall image inside the box and break marker alignment — hence neither here.)
  const overlay = (
    <div className="relative w-full bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element -- access-controlled image route, not optimizable */}
      <img
        src={shot.src}
        alt={`Screenshot of ${page.path}`}
        className="block h-auto w-full"
      />
      {page.markers.map((m, i) => {
        const active = activeRule != null && m.ruleId === activeRule;
        const dimmed = activeRule != null && m.ruleId !== activeRule;
        const style = {
          left: pct(m.x, shot.width),
          top: pct(m.y, shot.height),
          width: pct(m.w, shot.width),
          height: pct(m.h, shot.height),
        };
        const cls = cn(
          "absolute rounded-sm ring-2 transition-all",
          SEV_RING[m.impact],
          detail && "shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-bg)_55%,transparent)]",
          dimmed && "opacity-20",
          active && "z-10 ring-[3px] shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-blue)_30%,transparent)]",
        );
        if (detail && onSelectRule) {
          return (
            <button
              key={i}
              type="button"
              data-rule={m.ruleId}
              aria-label={`${m.title} (${m.impact}) — highlight on page`}
              aria-pressed={active}
              title={m.title}
              onClick={() => onSelectRule(m.ruleId)}
              className={cn(cls, "cursor-pointer hover:opacity-100")}
              style={style}
            />
          );
        }
        return <span key={i} aria-hidden data-rule={m.ruleId} className={cn(cls, "pointer-events-none")} style={style} />;
      })}
    </div>
  );

  // Detail view scrolls in its parent; the tile crops to the top of the page.
  if (detail) return overlay;
  return <div className="h-44 overflow-hidden bg-white sm:h-52">{overlay}</div>;
}

function CountRow({ counts }: { counts: SeverityCounts }) {
  const order: Severity[] = ["critical", "serious", "moderate", "minor"];
  if (counts.total === 0) {
    return <span className="text-xs font-bold text-green">No issues found</span>;
  }
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold">
      {order
        .filter((s) => counts[s] > 0)
        .map((s) => (
          <span key={s} className={cn("inline-flex items-center gap-1", SEV_TEXT[s])}>
            <span aria-hidden className={cn("size-2 rounded-sm", SEV_BG[s])} />
            <span className="tabular-nums">{counts[s]}</span>
            <span className="font-normal text-fg-soft capitalize">{s}</span>
          </span>
        ))}
    </span>
  );
}

/** Focused single-page view — the page large with issues pinned + listed. Selecting an issue
 *  highlights its markers on the screenshot rather than navigating away. */
function PageFocus({
  page,
  index,
  total,
  onPrev,
  onNext,
  onClose,
}: {
  page: BoardPage;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeRule, setActiveRule] = useState<string | null>(null);

  // Move focus into the view on mount. PageFocus is keyed by page.id in the parent, so it remounts
  // on prev/next — which also resets the highlight without a setState-in-effect.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const selectRule = useCallback((ruleId: string) => {
    setActiveRule((cur) => {
      const next = cur === ruleId ? null : ruleId;
      if (next) {
        requestAnimationFrame(() => {
          const el = scrollRef.current?.querySelector(`[data-rule="${next}"]`);
          el?.scrollIntoView({ block: "center", behavior: "smooth" });
        });
      }
      return next;
    });
  }, []);

  const hasShot = Boolean(page.shot);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-fg-soft no-underline transition-colors hover:text-fg"
        >
          <ArrowLeft className="size-4" aria-hidden strokeWidth={2.5} /> All pages
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-fg-soft tabular-nums">
            {index + 1} / {total}
          </span>
          <button type="button" onClick={onPrev} aria-label="Previous page" className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--color-panel-line-strong)] text-fg-soft transition-colors hover:text-fg">
            <ArrowLeft className="size-4" aria-hidden strokeWidth={2.5} />
          </button>
          <button type="button" onClick={onNext} aria-label="Next page" className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--color-panel-line-strong)] text-fg-soft transition-colors hover:text-fg">
            <ArrowRight className="size-4" aria-hidden strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <h3 ref={headingRef} tabIndex={-1} className="flex flex-wrap items-center gap-x-3 gap-y-1 font-display text-lg font-bold text-fg outline-none break-all">
        {page.path}
        {page.grouped ? <span className="text-sm font-normal text-fg-soft">{page.pageCount} pages (same route)</span> : null}
      </h3>
      <div className="mb-4 mt-1">
        <CountRow counts={page.counts} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="overflow-hidden rounded-xl border border-[var(--color-panel-line)]">
          <div ref={scrollRef} className="max-h-[72vh] overflow-y-auto">
            <ShotWithMarkers page={page} detail activeRule={activeRule} onSelectRule={selectRule} />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <p className="font-display text-sm font-bold uppercase tracking-wide text-fg-soft">
              Issues on this page
            </p>
            {activeRule ? (
              <button type="button" onClick={() => setActiveRule(null)} className="text-xs font-bold text-link hover:underline">
                Show all
              </button>
            ) : null}
          </div>
          {hasShot ? (
            <p className="mb-2 text-xs text-fg-soft">Select an issue to highlight its spots on the page.</p>
          ) : null}

          {page.issues.length === 0 ? (
            <p className="text-sm text-fg-soft">No automated issues found here.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {page.issues.map((it) => {
                const active = activeRule === it.ruleId;
                return (
                  <li key={it.ruleId} className="flex items-stretch gap-1">
                    <button
                      type="button"
                      onClick={() => selectRule(it.ruleId)}
                      aria-pressed={active}
                      disabled={!hasShot}
                      className={cn(
                        "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors",
                        active
                          ? "border-blue bg-blue/5"
                          : "border-[var(--color-panel-line)] bg-surface hover:border-[var(--color-panel-line-strong)]",
                        !hasShot && "cursor-default",
                      )}
                    >
                      <span aria-hidden className={cn("size-2.5 shrink-0 rounded-sm", it.impact ? SEV_BG[it.impact] : "bg-[var(--color-fg-soft)]")} />
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-fg">{it.title}</span>
                      <span className="shrink-0 text-xs font-bold tabular-nums text-fg-soft">{it.count}</span>
                    </button>
                    <Link
                      href={`/dashboard/issues/${encodeURIComponent(`${page.siteId}:${it.ruleId}`)}`}
                      aria-label={`Open full details for ${it.title}`}
                      title="Full issue details"
                      className="inline-flex w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--color-panel-line)] text-fg-soft no-underline transition-colors hover:border-[var(--color-panel-line-strong)] hover:text-fg"
                    >
                      <ExternalLink className="size-4" aria-hidden strokeWidth={2.25} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function PageTile({ page, onOpen }: { page: BoardPage; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col overflow-hidden rounded-xl border border-[var(--color-panel-line)] bg-surface text-left no-underline shadow-[var(--panel-shadow)] transition-all hover:-translate-y-0.5 hover:border-[var(--color-panel-line-strong)] hover:shadow-[var(--panel-shadow-lg)]"
    >
      <div className="relative">
        <ShotWithMarkers page={page} />
        <div className="absolute left-2 top-2">
          <ScorePill counts={page.counts} />
        </div>
        {page.shot ? (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-surface/85 px-1.5 py-0.5 text-[11px] font-bold text-fg-soft opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
            <Maximize2 className="size-3" aria-hidden strokeWidth={2.5} /> Open
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 border-t border-[var(--color-panel-line)] p-3">
        <p className="truncate font-display text-sm font-bold text-fg" title={page.path}>
          {page.path}
        </p>
        <CountRow counts={page.counts} />
      </div>
    </button>
  );
}

export function SiteBoard({
  pages,
  onFocusChange,
  previewLimit,
}: {
  pages: BoardPage[];
  /** Notified whenever the focused page changes (null = back to the grid), so a parent can
   *  re-scope its own stats to the open page. */
  onFocusChange?: (id: string | null) => void;
  /** When set, the grid shows only this many tiles behind a "Show all N pages" expander, so the
   *  board reads as a preview rather than a scroll-wall. Opening a page still works as normal. */
  previewLimit?: number;
}) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const setFocus = useCallback(
    (id: string | null) => {
      setFocusId(id);
      onFocusChange?.(id);
    },
    [onFocusChange],
  );

  // Sync the focus view with browser history so the Back button closes it (instead of leaving the
  // page). Opening pushes a state-only entry; prev/next replace it; closing pops it.
  const openFocus = useCallback(
    (id: string) => {
      window.history.pushState({ boardFocus: id }, "");
      setFocus(id);
    },
    [setFocus],
  );
  const replaceFocus = useCallback(
    (id: string) => {
      window.history.replaceState({ boardFocus: id }, "");
      setFocus(id);
    },
    [setFocus],
  );
  const closeFocus = useCallback(() => {
    if (window.history.state?.boardFocus) window.history.back();
    else setFocus(null);
  }, [setFocus]);

  useEffect(() => {
    const onPop = () => {
      const id = (window.history.state?.boardFocus as string | undefined) ?? null;
      setFocus(id && pages.some((p) => p.id === id) ? id : null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [pages, setFocus]);

  const focusIndex = pages.findIndex((p) => p.id === focusId);
  const focusPage = focusIndex >= 0 ? pages[focusIndex] : null;

  if (pages.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-[var(--color-panel-line-strong)] px-6 py-14 text-center">
        <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-blue/15 text-blue">
          <ScanLine className="size-6" aria-hidden strokeWidth={2} />
        </div>
        <p className="font-display text-lg font-bold text-fg">Your site will appear here</p>
        <p className="mt-1 max-w-md text-sm text-fg-soft">
          Once your snippet runs on a page, every scanned page shows up as a live screenshot with its
          accessibility problems pinned right where they are.
        </p>
      </div>
    );
  }

  if (focusPage) {
    return (
      <PageFocus
        key={focusPage.id}
        page={focusPage}
        index={focusIndex}
        total={pages.length}
        onPrev={() => replaceFocus(pages[(focusIndex - 1 + pages.length) % pages.length].id)}
        onNext={() => replaceFocus(pages[(focusIndex + 1) % pages.length].id)}
        onClose={closeFocus}
      />
    );
  }

  const collapsed = previewLimit != null && !showAll && pages.length > previewLimit;
  const visible = collapsed ? pages.slice(0, previewLimit) : pages;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((p) => (
          <PageTile key={p.id} page={p} onOpen={() => openFocus(p.id)} />
        ))}
      </div>
      {previewLimit != null && pages.length > previewLimit ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-link no-underline hover:underline"
        >
          {showAll ? "Show fewer pages" : `Show all ${pages.length} pages`}
        </button>
      ) : null}
    </>
  );
}
