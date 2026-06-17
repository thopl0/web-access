import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Dashboard primitives — the "soft homage" surfaces. These deliberately differ
 * from the marketing `Card`/`Section` (hard 3px borders + offset shadows): the
 * app favors thin borders, a small radius, and soft elevation so dense data
 * reads clearly. The display font + uppercase micro-labels keep the family look.
 */

/** Soft elevated surface. `as` lets it be a <section>, <li>, etc. */
export function Panel({
  children,
  className,
  interactive = false,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  as?: "div" | "section" | "li" | "article";
}) {
  return (
    <Tag className={cn("panel", interactive && "panel-link", "p-5 sm:p-6", className)}>
      {children}
    </Tag>
  );
}

/** Constrained app container — narrower gutters than the marketing site. */
export function DashboardContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-5xl px-5 sm:px-8", className)}>
      {children}
    </div>
  );
}

/** Back link / breadcrumb used above a detail header. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm font-bold text-fg-soft no-underline transition-colors hover:text-fg"
    >
      <span aria-hidden>←</span>
      {children}
    </Link>
  );
}

/**
 * Page header: optional eyebrow, a display-font title, supporting copy, and a
 * right-aligned actions slot. Returns the heading with `titleId` so the page's
 * landmark can reference it via aria-labelledby.
 */
export function PageHeader({
  titleId,
  eyebrow,
  title,
  lead,
  actions,
  className,
}: {
  titleId: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 border-b border-[var(--color-panel-line)] pb-6 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-fg-soft font-display">
            {eyebrow}
          </p>
        ) : null}
        <h1 id={titleId} className="text-3xl sm:text-4xl text-fg break-words">
          {title}
        </h1>
        {lead ? <p className="mt-2 max-w-2xl text-fg-soft">{lead}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-3">{actions}</div> : null}
    </header>
  );
}

/** Friendly empty state — dashed panel, centered, optional action. */
export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-[14px] border border-dashed border-[var(--color-panel-line-strong)] px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--color-fg)_5%,transparent)] text-fg-soft">
          {icon}
        </div>
      ) : null}
      <p className="font-display text-lg font-bold text-fg">{title}</p>
      {children ? <p className="mt-1 max-w-sm text-sm text-fg-soft">{children}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

type Accent = "neutral" | "pink" | "yellow" | "blue" | "green";

// Icon-badge tints. Color is decorative (the value/label carry meaning), so the
// low-contrast tint is fine; the icon is always aria-hidden.
const ACCENT_BADGE: Record<Accent, string> = {
  neutral: "bg-[color-mix(in_srgb,var(--color-fg)_7%,transparent)] text-fg-soft",
  pink: "bg-pink/15 text-pink",
  yellow: "bg-yellow/20 text-[color-mix(in_srgb,var(--color-fg)_70%,var(--yellow))]",
  blue: "bg-blue/15 text-blue",
  green: "bg-green/15 text-green",
};

/** Rounded icon chip used on stat cards and step lists. */
export function IconBadge({
  children,
  accent = "neutral",
  className,
}: {
  children: ReactNode;
  accent?: Accent;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-lg",
        ACCENT_BADGE[accent],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** KPI tile: icon + big display number + label, with an optional supporting hint. */
export function Stat({
  icon,
  value,
  label,
  hint,
  accent = "neutral",
}: {
  icon: ReactNode;
  value: ReactNode;
  label: string;
  hint?: ReactNode;
  accent?: Accent;
}) {
  const zero = value === 0;
  return (
    <Panel className="!p-4 sm:!p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div
            className={cn(
              "font-display text-3xl font-bold leading-none tabular-nums sm:text-4xl",
              zero ? "text-fg-soft" : "text-fg",
            )}
          >
            {value}
          </div>
          <p className="mt-2 text-xs font-bold uppercase tracking-wide text-fg-soft">{label}</p>
        </div>
        <IconBadge accent={accent}>{icon}</IconBadge>
      </div>
      {hint ? <p className="mt-3 text-xs text-fg-soft">{hint}</p> : null}
    </Panel>
  );
}

/** Numbered "how it works" steps for onboarding / filling the aside. */
export function StepList({
  steps,
}: {
  steps: Array<{ icon: ReactNode; title: string; body: ReactNode }>;
}) {
  return (
    <ol className="flex flex-col gap-4">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3">
          <IconBadge>{s.icon}</IconBadge>
          <div className="min-w-0">
            <p className="font-display text-sm font-bold text-fg">{s.title}</p>
            <p className="mt-0.5 text-sm text-fg-soft">{s.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** A monospace identifier chip (e.g. a site ID). Crisp + square — a brutalist nod. */
export function CodeChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <code
      className={cn(
        "inline-flex items-center rounded-md border border-[var(--color-panel-line-strong)] bg-[color-mix(in_srgb,var(--color-fg)_4%,transparent)] px-2 py-0.5 font-mono text-xs text-fg-soft",
        className,
      )}
    >
      {children}
    </code>
  );
}
