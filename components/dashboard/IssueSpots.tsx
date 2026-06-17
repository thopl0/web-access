"use client";

import { useId, useMemo, useState } from "react";
import { ChevronDown, Code2, FileText, Layers, MapPin, Sparkles } from "lucide-react";

import type { ElementBox, PageShot } from "@/lib/server/report";
import { cn } from "@/lib/utils";
import { AnnotatedShot } from "@/components/dashboard/AnnotatedShot";

/**
 * Serializable description of one offending element instance. The page builds
 * these on the server (so screenshots/boxes come pre-resolved) and hands them
 * to this client component, which owns all the interactive disclosure: pattern
 * vs. page grouping, the show-more cap, the per-spot "show code" toggle, and the
 * jump rail. No server-only imports here.
 */
export type SpotElement = {
  selector: string;
  htmlSnippet: string;
  crop?: string;
  cropWidth?: number;
  cropHeight?: number;
  box?: ElementBox;
  shot?: PageShot;
  explanation?: { title?: string; what: string; fix: string };
  /** Concrete pages this element family spans (set when the page is collapsed). */
  urls?: string[];
};

/** A recurring element pattern — same selector + markup — across the whole site. */
export type SpotPattern = {
  id: string;
  /** How many concrete spots share this exact markup. */
  count: number;
  /** Page paths this pattern appears on (deduped, may be capped by the caller). */
  pagePaths: string[];
  /** Pages folded behind collapsed dynamic-route families, if any. */
  extraPages: number;
  /** The canonical example to show once. */
  example: SpotElement;
};

/** A page and the offending elements on it (the "by page" view). */
export type SpotPage = {
  id: string;
  path: string;
  grouped: boolean;
  pageCount: number;
  elements: SpotElement[];
};

type View = "pattern" | "page";

const PAGES_SHOWN = 6;

function ShowCode({ selector, snippet, idBase }: { selector: string; snippet: string; idBase: string }) {
  const [open, setOpen] = useState(false);
  const panelId = `${idBase}-code`;
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-panel-line-strong)] bg-surface px-2.5 py-1.5 text-xs font-bold text-fg-soft transition-colors hover:text-fg"
      >
        <Code2 className="size-3.5" aria-hidden strokeWidth={2.5} />
        {open ? "Hide code" : "Show code"}
        <ChevronDown
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
          aria-hidden
          strokeWidth={2.5}
        />
      </button>
      {open ? (
        <div id={panelId} className="mt-2">
          <p className="text-xs font-bold uppercase tracking-wide text-fg-soft">Code location</p>
          <code className="mt-1 block break-all text-sm text-fg">{selector}</code>
          <pre className="inset mt-2 overflow-x-auto p-2 text-sm text-fg">
            <code>{snippet}</code>
          </pre>
        </div>
      ) : null}
    </div>
  );
}

/** Element-specific AI explanation, clearly badged as distinct from the generic rule guidance. */
function AiExplanation({ explanation }: { explanation: NonNullable<SpotElement["explanation"]> }) {
  return (
    <div className="mt-3 rounded-lg border border-blue/30 bg-blue/5 p-3">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-blue">
        <Sparkles className="size-3.5" aria-hidden strokeWidth={2.5} />
        AI suggestion
      </p>
      {explanation.title ? <p className="mt-1.5 font-bold text-fg">{explanation.title}</p> : null}
      <p className="mt-1 text-sm text-fg">{explanation.what}</p>
      <p className="mt-1 text-sm text-fg">
        <span className="font-bold">Fix: </span>
        {explanation.fix}
      </p>
    </div>
  );
}

function PageList({ paths, extra }: { paths: string[]; extra: number }) {
  const SHOWN = 5;
  const shown = paths.slice(0, SHOWN);
  const more = paths.length - shown.length + extra;
  return (
    <p className="mt-2 text-xs text-fg-soft">
      <span className="font-bold">On: </span>
      <span className="break-all">{shown.join(", ")}</span>
      {more > 0 ? ` +${more} more` : ""}
    </p>
  );
}

function PatternCard({ pattern, idBase }: { pattern: SpotPattern; idBase: string }) {
  const ex = pattern.example;
  return (
    <article
      id={idBase}
      className="scroll-mt-24 rounded-xl border border-[var(--color-panel-line)] bg-surface p-4 sm:p-5"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--color-fg)_7%,transparent)] px-2.5 py-1 text-xs font-bold text-fg">
          <Layers className="size-3.5 text-fg-soft" aria-hidden strokeWidth={2.5} />
          {pattern.count === 1 ? "Appears once" : `Appears ${pattern.count}×`}
        </span>
        {pattern.count > 1 ? (
          <span className="text-xs font-bold text-fg-soft">same markup — fix once</span>
        ) : null}
      </div>

      <AnnotatedShot
        shot={ex.shot}
        box={ex.box}
        crop={ex.crop}
        cropWidth={ex.cropWidth}
        cropHeight={ex.cropHeight}
        label={`Screenshot of the affected element: ${ex.selector}`}
      />

      {ex.explanation ? <AiExplanation explanation={ex.explanation} /> : null}

      <PageList paths={pattern.pagePaths} extra={pattern.extraPages} />

      <ShowCode selector={ex.selector} snippet={ex.htmlSnippet} idBase={idBase} />
    </article>
  );
}

function PageCard({ page, idBase }: { page: SpotPage; idBase: string }) {
  return (
    <article
      id={idBase}
      className="scroll-mt-24 rounded-xl border border-[var(--color-panel-line)] bg-surface p-4 sm:p-5"
    >
      <p className="mb-1 flex flex-wrap items-center gap-2 font-display font-bold text-fg break-all">
        <MapPin className="size-4 shrink-0 text-fg-soft" aria-hidden strokeWidth={2.5} />
        {page.path}
        {page.grouped ? (
          <span className="text-xs font-normal text-fg-soft">{page.pageCount} pages (same route)</span>
        ) : null}
      </p>
      <p className="mb-3 text-xs text-fg-soft">
        {page.elements.length === 1 ? "1 spot" : `${page.elements.length} spots`} here
      </p>
      <ul className="flex flex-col gap-4">
        {page.elements.map((el, i) => (
          <li key={`${idBase}-${i}`} className="border-t border-[var(--inset-line)] pt-4 first:border-0 first:pt-0">
            <AnnotatedShot
              shot={el.shot}
              box={el.box}
              crop={el.crop}
              cropWidth={el.cropWidth}
              cropHeight={el.cropHeight}
              label={`Screenshot of the affected element: ${el.selector}`}
            />
            {el.explanation ? <AiExplanation explanation={el.explanation} /> : null}
            <ShowCode selector={el.selector} snippet={el.htmlSnippet} idBase={`${idBase}-${i}`} />
          </li>
        ))}
      </ul>
    </article>
  );
}

export function IssueSpots({
  patterns,
  pages,
  totalSpots,
}: {
  patterns: SpotPattern[];
  pages: SpotPage[];
  totalSpots: number;
}) {
  const [view, setView] = useState<View>("pattern");
  const [shownPatterns, setShownPatterns] = useState(PAGES_SHOWN);
  const [shownPages, setShownPages] = useState(PAGES_SHOWN);
  const railId = useId();

  const items = view === "pattern" ? patterns : pages;
  const shown = view === "pattern" ? shownPatterns : shownPages;
  const setShown = view === "pattern" ? setShownPatterns : setShownPages;

  // Stable anchor ids for the rail + cards.
  const entries = useMemo(
    () =>
      view === "pattern"
        ? patterns.map((p, i) => ({
            anchor: `${railId}-pat-${i}`,
            label: p.example.selector,
            count: p.count,
          }))
        : pages.map((p, i) => ({ anchor: `${railId}-page-${i}`, label: p.path, count: p.elements.length })),
    [view, patterns, pages, railId],
  );

  const tabBtn = (v: View, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      onClick={() => setView(v)}
      aria-pressed={view === v}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold transition-colors",
        view === v
          ? "bg-[color-mix(in_srgb,var(--color-fg)_8%,transparent)] text-fg"
          : "text-fg-soft hover:text-fg",
      )}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <section aria-labelledby={`${railId}-heading`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2
          id={`${railId}-heading`}
          className="font-display text-sm font-bold uppercase tracking-wide text-fg-soft"
        >
          Where it appears
          <span className="ml-2 normal-case text-fg">
            {totalSpots} {totalSpots === 1 ? "spot" : "spots"} · {patterns.length}{" "}
            {patterns.length === 1 ? "pattern" : "patterns"} · {pages.length}{" "}
            {pages.length === 1 ? "page" : "pages"}
          </span>
        </h2>
        <div
          role="group"
          aria-label="Group spots by"
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-panel-line-strong)] bg-surface p-1"
        >
          {tabBtn("pattern", <Layers className="size-4" aria-hidden strokeWidth={2.5} />, "By pattern")}
          {tabBtn("page", <FileText className="size-4" aria-hidden strokeWidth={2.5} />, "By page")}
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-8">
        {/* Jump rail — wide screens only; the cards below are the source of truth on mobile. */}
        <nav
          aria-label="Jump to spot"
          className="sticky top-20 hidden max-h-[calc(100vh-6rem)] self-start overflow-y-auto lg:block"
        >
          <p className="mb-2 px-2 text-xs font-bold uppercase tracking-wide text-fg-soft">
            {view === "pattern" ? "Patterns" : "Pages"}
          </p>
          <ul className="flex flex-col gap-0.5">
            {entries.map((e) => (
              <li key={e.anchor}>
                <a
                  href={`#${e.anchor}`}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-fg-soft no-underline transition-colors hover:bg-[color-mix(in_srgb,var(--color-fg)_5%,transparent)] hover:text-fg"
                >
                  <span className="min-w-0 truncate font-mono text-xs">{e.label}</span>
                  <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--color-fg)_8%,transparent)] px-1.5 text-xs font-bold tabular-nums text-fg-soft">
                    {e.count}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Cards */}
        <div className="mt-4 flex flex-col gap-4 lg:mt-0">
          {view === "pattern"
            ? patterns.slice(0, shown).map((p, i) => (
                <PatternCard key={`${railId}-pat-${i}`} pattern={p} idBase={`${railId}-pat-${i}`} />
              ))
            : pages.slice(0, shown).map((p, i) => (
                <PageCard key={`${railId}-page-${i}`} page={p} idBase={`${railId}-page-${i}`} />
              ))}

          {items.length > shown ? (
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGES_SHOWN)}
              className="self-center rounded-lg border border-[var(--color-panel-line-strong)] bg-surface px-4 py-2 text-sm font-bold text-fg transition-colors hover:bg-[color-mix(in_srgb,var(--color-fg)_5%,transparent)]"
            >
              Show {Math.min(PAGES_SHOWN, items.length - shown)} more
              {view === "pattern" ? " patterns" : " pages"}
              <span className="ml-1 text-fg-soft">({items.length - shown} hidden)</span>
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
