import { CircleCheck, ShieldCheck, TriangleAlert } from "lucide-react";

import type { ConformanceReport, Principle } from "@/lib/wcag";
import { PRINCIPLES } from "@/lib/wcag";
import { cn } from "@/lib/utils";

const PRINCIPLE_ORDER: Principle[] = [1, 2, 3, 4];

/** A small level chip: green "Conformant" or pink "N failing". */
function LevelChip({ level, failing }: { level: string; failing: number }) {
  const ok = failing === 0;
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl border-2 px-4 py-3",
        ok ? "border-green/40 bg-green/10" : "border-pink/40 bg-pink/10",
      )}
    >
      <div>
        <p className="font-display text-sm font-bold uppercase tracking-wide text-fg-soft">
          WCAG 2.1 Level {level}
        </p>
        <p className={cn("font-display text-lg font-bold", ok ? "text-green" : "text-pink")}>
          {ok ? "Conformant" : `${failing} criteria failing`}
        </p>
      </div>
      {ok ? (
        <CircleCheck className="size-6 shrink-0 text-green" aria-hidden strokeWidth={2.25} />
      ) : (
        <TriangleAlert className="size-6 shrink-0 text-pink" aria-hidden strokeWidth={2.25} />
      )}
    </div>
  );
}

/**
 * WCAG conformance scorecard: Level A / AA status plus a breakdown of failing criteria across the
 * four POUR principles. Pure/server-safe — feed it a ConformanceReport built from the open issues.
 */
export function WcagScorecard({ report }: { report: ConformanceReport }) {
  if (!report.evaluated) {
    return (
      <p className="text-sm text-fg-soft">
        Run a scan to see WCAG 2.1 conformance.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <LevelChip level="A" failing={report.byLevel.A.failing} />
        <LevelChip level="AA" failing={report.byLevel.AA.failing} />
      </div>

      <div>
        <p className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-fg-soft">
          By principle
        </p>
        <ul className="flex flex-col gap-3">
          {PRINCIPLE_ORDER.map((p) => {
            const { failing, total } = report.byPrinciple[p];
            const pct = total > 0 ? (failing / total) * 100 : 0;
            return (
              <li key={p} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-sm font-bold text-fg">{PRINCIPLES[p]}</span>
                <span
                  aria-hidden
                  className="h-2 flex-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--color-fg)_8%,transparent)]"
                >
                  <span
                    className={cn("block h-full", failing > 0 ? "bg-pink" : "bg-green")}
                    style={{ width: `${failing > 0 ? Math.max(pct, 8) : 100}%` }}
                  />
                </span>
                <span className="w-20 shrink-0 text-right text-sm tabular-nums text-fg-soft">
                  {failing === 0 ? "All clear" : `${failing} failing`}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/**
 * European Accessibility Act readiness. The EAA (in force since 28 June 2025) requires conformance
 * with EN 301 549, which adopts WCAG 2.1 Level AA — so readiness tracks AA conformance directly.
 */
export function EaaReadiness({ report }: { report: ConformanceReport }) {
  const ready = report.aaConformant;
  const evaluated = report.evaluated;

  return (
    <div
      className={cn(
        "rounded-2xl border-2 p-5 sm:p-6",
        !evaluated
          ? "border-[var(--color-panel-line-strong)]"
          : ready
            ? "border-green/40 bg-green/10"
            : "border-yellow/50 bg-yellow/10",
      )}
    >
      <div className="flex items-start gap-3">
        <ShieldCheck
          className={cn(
            "size-7 shrink-0",
            !evaluated ? "text-fg-soft" : ready ? "text-green" : "text-[color-mix(in_srgb,var(--color-fg)_60%,var(--yellow))]",
          )}
          aria-hidden
          strokeWidth={2.25}
        />
        <div className="min-w-0">
          <p className="font-display text-lg font-bold text-fg">EU Accessibility Act</p>
          <p className="mt-0.5 text-sm font-bold">
            {!evaluated ? (
              <span className="text-fg-soft">Run a scan to check readiness.</span>
            ) : ready ? (
              <span className="text-green">Likely compliant ✓</span>
            ) : (
              <span className="text-[color-mix(in_srgb,var(--color-fg)_70%,var(--yellow))]">
                {report.blockingAA} {report.blockingAA === 1 ? "issue" : "issues"} left to fix
              </span>
            )}
          </p>
          <p className="mt-2 text-sm text-fg-soft">
            EU law since 2025: sites serving EU customers must meet WCAG&nbsp;2.1&nbsp;AA — the
            standard scored above.
          </p>

          <details className="group mt-2 text-sm">
            <summary className="cursor-pointer font-bold text-link marker:content-none [&::-webkit-details-marker]:hidden">
              Does this apply to me?
            </summary>
            <div className="mt-2 flex flex-col gap-2 text-fg-soft">
              <p>
                Generally yes if you sell products or services to people in the EU — e.g. online
                stores, booking, banking, or e-books. Meeting WCAG&nbsp;2.1&nbsp;AA above is how you
                comply.
              </p>
              <p className="text-xs">
                General guidance, not legal advice.{" "}
                <a
                  href="https://employment-social-affairs.ec.europa.eu/policies-and-activities/social-protection-social-inclusion/persons-disabilities/union-equality-strategy-rights-persons-disabilities-2021-2030/european-accessibility-act_en"
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold text-link underline underline-offset-2"
                >
                  Learn more
                </a>
              </p>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
