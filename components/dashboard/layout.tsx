import type { ReactNode } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { SeverityDot } from "@/components/dashboard/severity";
import type { Severity } from "@/lib/severity";

/**
 * Dashboard layout primitives — the calmer, analytics-console language (Google Analytics / MS
 * Clarity feel). These exist to fight the "wall of bordered cards" problem: pages should read as
 * a few airy SECTIONS around one focal point, not a stack of equal-weight panels.
 *
 *   PageShell   — one standard page width + padding, so every screen lines up.
 *   Section     — a titled region with breathing room and at most one action; NO box of its own.
 *   MetricStrip — a single divided row of KPIs (replaces a grid of 4 bordered Stat cards).
 *
 * All server-safe (no hooks) so any page/server component can compose them.
 */

/** Standard page wrapper. `size="narrow"` for reading-width detail views. */
export function PageShell({
  children,
  size = "default",
  className,
}: {
  children: ReactNode;
  size?: "default" | "narrow";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-5 py-8 sm:px-8",
        size === "narrow" ? "max-w-3xl" : "max-w-[1180px]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * An airy, titled section. The title is a quiet uppercase micro-label (the app's established
 * section style); content flows directly beneath with no surrounding border, so grouping comes
 * from whitespace + the label, not another box. Use a `Panel`/card inside only for genuinely
 * discrete objects (a site, an issue, a snapshot).
 */
export function Section({
  title,
  description,
  action,
  children,
  className,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      aria-label={typeof title === "string" ? title : undefined}
      className={cn("mt-10 first:mt-0", className)}
    >
      {title || action ? (
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className="min-w-0">
            {title ? (
              <h2 className="font-display text-sm font-bold uppercase tracking-wide text-fg-soft">
                {title}
              </h2>
            ) : null}
            {description ? <p className="mt-1 text-sm text-fg-soft">{description}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export type Metric = {
  label: string;
  value: ReactNode;
  /** Small supporting line under the label. */
  hint?: ReactNode;
  /** Pairs a severity swatch with the label (color is never the sole signal — label carries it). */
  severity?: Severity;
  /** Makes the whole cell a link (quiet hover). */
  href?: string;
};

/**
 * A single divided row of headline numbers — the analytics "scorecard" pattern. One surface, hairline
 * dividers, big tabular numerals. Replaces a grid of separate bordered Stat cards so the eye reads a
 * calm band of facts instead of four competing boxes.
 */
export function MetricStrip({ items, className }: { items: Metric[]; className?: string }) {
  const cols =
    items.length >= 4 ? "sm:grid-cols-4" : items.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";
  return (
    <div
      className={cn(
        "grid grid-cols-2 overflow-hidden rounded-2xl border border-[var(--color-panel-line)] bg-surface shadow-[var(--panel-shadow)]",
        "divide-x divide-y divide-[var(--color-panel-line)] sm:divide-y-0",
        cols,
        className,
      )}
    >
      {items.map((m, i) => {
        const zero = m.value === 0;
        const body = (
          <>
            <div
              className={cn(
                "font-display text-3xl font-bold leading-none tabular-nums sm:text-4xl",
                zero ? "text-fg-soft" : "text-fg",
              )}
            >
              {m.value}
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-fg-soft">
              {m.severity ? <SeverityDot severity={m.severity} /> : null}
              {m.label}
            </div>
            {m.hint ? <div className="mt-1 text-xs font-normal text-fg-soft">{m.hint}</div> : null}
          </>
        );
        const cls = "block px-4 py-4 sm:px-5 sm:py-5";
        return m.href ? (
          <Link
            key={i}
            href={m.href}
            className={cn(
              cls,
              "no-underline transition-colors hover:bg-[color-mix(in_srgb,var(--color-fg)_4%,transparent)]",
            )}
          >
            {body}
          </Link>
        ) : (
          <div key={i} className={cls}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
