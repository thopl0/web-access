import { CircleCheck, History, TriangleAlert } from "lucide-react";

import { Panel } from "@/components/dashboard/ui";
import { explainRule } from "@/lib/explain";
import type { RuleDelta, ScanDelta } from "@/lib/server/verification";

/**
 * The report's "Changes since last scan" card — the verification loop made visible (plan §8.5 /
 * backlog #4). The product doesn't just suggest fixes; it CONFIRMS them. When the latest re-scan finds
 * a rule that was present last scan now gone site-wide, that's a VERIFIED fix, and we say so in plain
 * words. Regressions (rules newly introduced) get their own honest group.
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

function ResolvedItem({ delta }: { delta: RuleDelta }) {
  return (
    <li className="inset flex items-start gap-3 p-3">
      <CircleCheck className="mt-0.5 size-5 shrink-0 text-green" aria-hidden strokeWidth={2.25} />
      <div className="min-w-0">
        <p className="font-bold text-fg">{ruleTitle(delta)}</p>
        <p className="mt-0.5 text-sm text-fg-soft leading-relaxed">{resolvedConfirmation(delta)}</p>
      </div>
    </li>
  );
}

function IntroducedItem({ delta }: { delta: RuleDelta }) {
  const scope = pageScope(delta.pageCount);
  return (
    <li className="inset flex items-start gap-3 p-3">
      <TriangleAlert
        className="mt-0.5 size-5 shrink-0 text-[color-mix(in_srgb,var(--color-fg)_60%,var(--yellow))]"
        aria-hidden
        strokeWidth={2.25}
      />
      <div className="min-w-0">
        <p className="font-bold text-fg">{ruleTitle(delta)}</p>
        <p className="mt-0.5 text-sm text-fg-soft leading-relaxed">
          New since your last scan{scope ? ` — found ${scope}` : ""}.
        </p>
      </div>
    </li>
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
