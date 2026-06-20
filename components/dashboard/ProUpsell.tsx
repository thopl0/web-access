import { CircleCheck, Sparkles } from "lucide-react";

import { Panel } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/Button";

/**
 * Overview-level "you're on Free — here's what Pro adds" card. Free is diagnosis-only: it shows every
 * issue and why it matters, but the actual remedies (and the AI/monitoring/artifacts around them) are
 * paid. This is the top-of-report nudge that turns "what to fix first" into "…and here's how to get it
 * fixed". Rendered only for owners without the fixes entitlement (see the overview's `fixesLocked`).
 *
 * Server component: pure presentation, no props — the perk list mirrors the Pro tier in lib/entitlements.
 */
const PERKS = [
  "Paste-ready before→after fixes for every issue — plus a copy-paste prompt for your AI builder",
  "An AI-written report that explains each problem in plain language",
  "Continuous monitoring with email alerts the moment a release introduces new issues",
  "Downloadable compliance artifacts — accessibility statement, certificate, and VPAT",
];

export function ProUpsell() {
  return (
    <Panel
      as="section"
      aria-labelledby="pro-upsell-title"
      className="border-l-4 border-l-[var(--color-link)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden
            className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--color-link)_14%,transparent)] text-link"
          >
            <Sparkles className="size-5" strokeWidth={2.25} />
          </span>
          <div className="min-w-0">
            <p className="font-display text-xs font-bold uppercase tracking-[0.12em] text-fg-soft">
              On the Free plan
            </p>
            <h2 id="pro-upsell-title" className="mt-1 font-display text-xl font-bold text-fg">
              See the issues. Upgrade to fix them.
            </h2>
          </div>
        </div>
        <Button href="/pricing" variant="blue" size="sm" className="shrink-0">
          Upgrade to Pro
        </Button>
      </div>

      <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {PERKS.map((perk) => (
          <li key={perk} className="flex items-start gap-2.5">
            <CircleCheck
              className="mt-0.5 size-4 shrink-0 text-link"
              aria-hidden
              strokeWidth={2.25}
            />
            <span className="text-sm leading-relaxed text-fg-soft">{perk}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
