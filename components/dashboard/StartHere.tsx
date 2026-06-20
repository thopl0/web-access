import { Sparkles } from "lucide-react";

import { Panel } from "@/components/dashboard/ui";
import { explainRule } from "@/lib/explain";
import { RISK_TIER_LABEL, type RiskTier } from "@/lib/legalRisk";
import type { SiteStartHere } from "@/lib/server/report";

/**
 * The report's "Start here" card — the top of a site report. It answers the one question a
 * non-technical owner actually has on opening the report ("of all this, what do I fix FIRST, and
 * why?") with a plain-English summary plus a legal-risk-ordered shortlist.
 *
 * This is an accessibility product, so the card itself practices what it preaches:
 *  - tier badges carry TEXT ("Top legal risk"), never colour alone — the colour is a redundant accent;
 *  - the list is a real <ol> in risk order, with the tier announced as part of each item;
 *  - all icons are decorative (aria-hidden); meaning lives in text.
 *
 * Server component: pure presentation over the server-loaded `SiteStartHere`.
 */

/** Per-tier visual accent. Colour is REDUNDANT — `RISK_TIER_LABEL[tier]` text carries the meaning, so
 *  the badge is fully legible without colour (and to screen readers). */
const TIER_STYLE: Record<RiskTier, string> = {
  high: "border-pink/40 bg-pink/10 text-[color-mix(in_srgb,var(--color-fg)_55%,var(--pink))]",
  medium: "border-yellow/50 bg-yellow/15 text-[color-mix(in_srgb,var(--color-fg)_60%,var(--yellow))]",
  low: "border-[var(--color-panel-line-strong)] bg-[color-mix(in_srgb,var(--color-fg)_5%,transparent)] text-fg-soft",
};

function TierBadge({ tier }: { tier: RiskTier }) {
  return (
    <span
      className={[
        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-bold",
        TIER_STYLE[tier],
      ].join(" ")}
    >
      {RISK_TIER_LABEL[tier]}
    </span>
  );
}

export function StartHere({ startHere }: { startHere: SiteStartHere }) {
  const { plainSummary, triage, source } = startHere;

  // Honest provenance, in words: AI-warmed prose vs a deterministic ranking. Never overstated.
  const provenance =
    source === "ai"
      ? "Written by our AI from your scan results."
      : "Ranked automatically by legal-risk weighting.";

  return (
    <Panel
      as="section"
      aria-labelledby="start-here-title"
      className="border-l-4 border-l-[var(--color-link)]"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--color-link)_14%,transparent)] text-link"
        >
          <Sparkles className="size-5" strokeWidth={2.25} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-fg-soft font-display">
            Start here
          </p>
          <h2 id="start-here-title" className="mt-1 font-display text-xl font-bold text-fg">
            What to fix first
          </h2>
        </div>
      </div>

      <p className="mt-4 max-w-2xl text-fg leading-relaxed">{plainSummary}</p>

      {triage.length > 0 ? (
        <>
          <p className="mt-6 text-xs font-bold uppercase tracking-wide text-fg-soft">
            Highest legal risk first
          </p>
          <ol className="mt-3 flex flex-col gap-2.5">
            {triage.map((t, i) => {
              const title = explainRule(t.ruleId)?.title ?? t.ruleId;
              return (
                <li
                  key={`${t.ruleId}-${t.selector ?? i}`}
                  className="inset flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:gap-3"
                >
                  <span
                    aria-hidden
                    className="hidden size-6 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-fg)_7%,transparent)] text-xs font-bold tabular-nums text-fg-soft sm:inline-flex"
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-fg">{title}</span>
                      <TierBadge tier={t.tier} />
                    </div>
                    <p className="mt-1 text-sm text-fg-soft leading-relaxed">{t.why}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      ) : null}

      <p className="mt-4 text-xs text-fg-soft">{provenance}</p>
    </Panel>
  );
}
