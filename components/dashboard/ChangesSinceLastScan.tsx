import type { ReactNode } from "react";
import { ChevronRight, CircleCheck, History, TriangleAlert } from "lucide-react";

import { Panel } from "@/components/dashboard/ui";
import { explainRule } from "@/lib/explain";
import type { RuleDelta, ScanDelta } from "@/lib/server/verification";

/**
 * The report's "Changes since last scan" card — the verification loop made visible (plan §8.5 /
 * backlog #4). The product doesn't just suggest fixes; it CONFIRMS them. When the latest re-scan finds
 * a rule that was present last scan now gone site-wide, that's a VERIFIED fix, and we say so in plain
 * words. Regressions (rules newly introduced) get their own honest group.
 *
 * Each change is expandable (native, keyboard-accessible <details>/<summary>, no client JS — this stays
 * a server component) to reveal WHICH pages changed and how: for a new issue, the pages it now appears
 * on; for a verified fix, the pages it has since cleared from — each with its per-page spot count.
 *
 * This is an accessibility product, so the card practices what it preaches:
 *  - status is carried by TEXT + icon, never by colour alone (the colour is a redundant accent);
 *  - each change is a real list item with its plain-language name and confirmation line announced;
 *  - all icons are decorative (aria-hidden) — meaning lives in the text.
 *
 * Renders NOTHING on a first scan (no previous state to compare) or when nothing changed — no noise.
 * Server component: pure presentation over the server-computed `ScanDelta`.
 */

/** Friendly, non-technical name for a rule; falls back to the rule's own message, then its id. */
function ruleTitle(d: RuleDelta): string {
  return explainRule(d.ruleId)?.title ?? d.message ?? d.ruleId;
}

/** "on 3 pages" / "on 1 page" / "" (when the count is unknown). Plain language, not jargon. */
function pageScope(pageCount: number): string {
  if (pageCount <= 0) return "";
  return pageCount === 1 ? "on 1 page" : `on ${pageCount} pages`;
}

/**
 * The strongest true statement we can make about a verified fix, in everyday words:
 *  - owner had marked it resolved  → "you'd marked this resolved — now verified"
 *  - a fix had been suggested      → "the fix you applied worked"
 *  - otherwise                     → the plain confirmation that it's gone.
 */
function resolvedConfirmation(d: RuleDelta): string {
  if (d.ownerMarkedResolved) return "You'd marked this resolved — now verified in your latest scan.";
  if (d.hadSuggestedFix) return "The fix you applied worked — confirmed gone in your latest scan.";
  return "Fixed — confirmed gone in your latest scan.";
}

/** How many affected pages to list inside an expanded item before collapsing into "…and N more". */
const VISIBLE_PAGES = 10;

/**
 * The expanded body shared by both kinds of change: the pages this rule changed on, worst-first, each
 * with its per-page spot count. There's no clean per-page deep link in the dashboard (the Pages list has
 * no per-row anchor, and the issue route is keyed per rule, not per page), so the paths are shown as
 * plain text. The "…and N more" tail uses the rule's true `pageCount`, not the capped list length.
 *
 * `verb` carries the meaning in words — "now appears on" for a new issue, "cleared from" for a fix.
 */
function AffectedPages({ delta, verb }: { delta: RuleDelta; verb: string }) {
  if (delta.pages.length === 0) return null;
  const visible = delta.pages.slice(0, VISIBLE_PAGES);
  const remaining = delta.pageCount - visible.length;

  return (
    <div className="mt-2 border-t border-[var(--color-panel-line)] pt-2.5">
      <p className="text-xs font-bold uppercase tracking-wide text-fg-soft">{verb}</p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {visible.map((p) => (
          <li key={p.path} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="break-all font-mono text-fg-soft">{p.path}</span>
            <span className="shrink-0 text-xs text-fg-soft">
              {p.spots} {p.spots === 1 ? "spot" : "spots"}
            </span>
          </li>
        ))}
      </ul>
      {remaining > 0 ? (
        <p className="mt-1.5 text-xs text-fg-soft">
          …and {remaining} more {remaining === 1 ? "page" : "pages"}.
        </p>
      ) : null}
    </div>
  );
}

/**
 * A change item: an expandable <details> whose <summary> keeps the rule title + its one-line status, and
 * whose body reveals the affected pages. Native disclosure (no client JS) keeps this a server component
 * and keyboard-accessible for free. `expandable` is false when there are no pages to show, so we don't
 * offer an empty disclosure.
 */
function ChangeItem({
  delta,
  icon,
  status,
  pagesVerb,
}: {
  delta: RuleDelta;
  icon: ReactNode;
  status: string;
  pagesVerb: string;
}) {
  const expandable = delta.pages.length > 0;

  const header = (
    <>
      {icon}
      <div className="min-w-0 flex-1">
        <p className="font-bold text-fg">{ruleTitle(delta)}</p>
        <p className="mt-0.5 text-sm text-fg-soft leading-relaxed">{status}</p>
      </div>
    </>
  );

  if (!expandable) {
    return <li className="inset flex items-start gap-3 p-3">{header}</li>;
  }

  return (
    <li className="inset p-3">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start gap-3 [&::-webkit-details-marker]:hidden">
          {header}
          <span className="mt-0.5 flex shrink-0 items-center gap-1 text-xs font-bold text-fg-soft">
            <span className="group-open:hidden">Show pages</span>
            <span className="hidden group-open:inline">Hide pages</span>
            <ChevronRight
              className="size-4 transition-transform group-open:rotate-90"
              aria-hidden
              strokeWidth={2.25}
            />
          </span>
        </summary>
        <AffectedPages delta={delta} verb={pagesVerb} />
      </details>
    </li>
  );
}

function ResolvedItem({ delta }: { delta: RuleDelta }) {
  return (
    <ChangeItem
      delta={delta}
      icon={
        <CircleCheck className="mt-0.5 size-5 shrink-0 text-green" aria-hidden strokeWidth={2.25} />
      }
      status={resolvedConfirmation(delta)}
      pagesVerb="Cleared from these pages"
    />
  );
}

function IntroducedItem({ delta }: { delta: RuleDelta }) {
  const scope = pageScope(delta.pageCount);
  return (
    <ChangeItem
      delta={delta}
      icon={
        <TriangleAlert
          className="mt-0.5 size-5 shrink-0 text-[color-mix(in_srgb,var(--color-fg)_60%,var(--yellow))]"
          aria-hidden
          strokeWidth={2.25}
        />
      }
      status={`New since your last scan${scope ? ` — found ${scope}` : ""}.`}
      pagesVerb="Now appears on these pages"
    />
  );
}

export function ChangesSinceLastScan({ delta }: { delta: ScanDelta }) {
  const { resolved, introduced, hasPrevious } = delta;

  // No previous scan to compare against (first scan), or nothing changed: show nothing — no noise.
  if (!hasPrevious || (resolved.length === 0 && introduced.length === 0)) return null;

  const fixedCount = resolved.length;
  const newCount = introduced.length;

  // A plain-English headline summary, so the count is announced as text (not implied by the lists).
  const summary = [
    fixedCount > 0 ? `${fixedCount} ${fixedCount === 1 ? "issue" : "issues"} verified fixed` : null,
    newCount > 0 ? `${newCount} new ${newCount === 1 ? "issue" : "issues"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Panel
      as="section"
      aria-labelledby="changes-since-title"
      className="border-l-4 border-l-green"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-green/15 text-green"
        >
          <History className="size-5" strokeWidth={2.25} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-fg-soft font-display">
            Changes since last scan
          </p>
          <h2 id="changes-since-title" className="mt-1 font-display text-xl font-bold text-fg">
            We re-checked your fixes
          </h2>
          <p className="mt-1 text-sm text-fg-soft">{summary}</p>
        </div>
      </div>

      {fixedCount > 0 ? (
        <div className="mt-5">
          <p className="text-xs font-bold uppercase tracking-wide text-fg-soft">Verified fixes</p>
          <p className="mt-1 text-sm text-fg-soft leading-relaxed">
            These were present in your previous scan and are gone now — your latest scan confirms each
            one is fixed across every page.
          </p>
          <ul className="mt-3 flex flex-col gap-2.5">
            {resolved.map((d) => (
              <ResolvedItem key={d.ruleId} delta={d} />
            ))}
          </ul>
        </div>
      ) : null}

      {newCount > 0 ? (
        <div className="mt-6">
          <p className="text-xs font-bold uppercase tracking-wide text-fg-soft">New since last scan</p>
          <p className="mt-1 text-sm text-fg-soft leading-relaxed">
            These weren&apos;t in your previous scan. They may be new content, or a fix that slipped —
            worth a look.
          </p>
          <ul className="mt-3 flex flex-col gap-2.5">
            {introduced.map((d) => (
              <IntroducedItem key={d.ruleId} delta={d} />
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}
