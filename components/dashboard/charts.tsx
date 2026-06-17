import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { SEVERITY_ORDER, type SeverityCounts } from "@/lib/severity";
import type { TrendPoint } from "@/lib/server/report";
import { cn } from "@/lib/utils";

/** Week-over-week delta chip. More issues found = worse (pink); fewer = better (green). */
export function DeltaChip({ delta }: { delta: number | null }) {
  if (delta === null) {
    return <span className="text-xs font-bold text-fg-soft">— no prior data</span>;
  }
  const up = delta > 0;
  const flat = delta === 0;
  const tone = flat ? "text-fg-soft" : up ? "text-pink" : "text-green";
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-bold", tone)}>
      {!flat ? <Icon className="size-3.5" aria-hidden strokeWidth={2.5} /> : null}
      {flat ? "No change" : `${Math.abs(delta)}%`} <span className="text-fg-soft">vs last week</span>
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Severity donut — distribution of issues by severity.
 * Pure SVG, no deps. Decorative (aria-hidden); a text legend carries the
 * numbers for assistive tech.
 * ------------------------------------------------------------------ */
const SEV_STROKE: Record<(typeof SEVERITY_ORDER)[number], string> = {
  critical: "stroke-pink",
  serious: "stroke-yellow",
  moderate: "stroke-blue",
  minor: "stroke-[var(--color-fg-soft)]",
};
const SEV_DOT: Record<(typeof SEVERITY_ORDER)[number], string> = {
  critical: "bg-pink",
  serious: "bg-yellow",
  moderate: "bg-blue",
  minor: "bg-[var(--color-fg-soft)]",
};

export function SeverityDonut({ counts }: { counts: SeverityCounts }) {
  const R = 56;
  const C = 2 * Math.PI * R;
  const total = counts.total;

  let offset = 0;
  const arcs =
    total === 0
      ? []
      : SEVERITY_ORDER.filter((s) => counts[s] > 0).map((s) => {
          const frac = counts[s] / total;
          const len = frac * C;
          const arc = { s, len, gap: C - len, dashoffset: -offset };
          offset += len;
          return arc;
        });

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0">
        <svg width="140" height="140" viewBox="0 0 140 140" aria-hidden className="-rotate-90">
          <circle
            cx="70"
            cy="70"
            r={R}
            fill="none"
            strokeWidth="16"
            className="stroke-[color-mix(in_srgb,var(--color-fg)_8%,transparent)]"
          />
          {total === 0 ? (
            <circle cx="70" cy="70" r={R} fill="none" strokeWidth="16" className="stroke-green/70" />
          ) : (
            arcs.map((a) => (
              <circle
                key={a.s}
                cx="70"
                cy="70"
                r={R}
                fill="none"
                strokeWidth="16"
                strokeDasharray={`${a.len} ${a.gap}`}
                strokeDashoffset={a.dashoffset}
                className={SEV_STROKE[a.s]}
                strokeLinecap="butt"
              />
            ))
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-3xl font-bold leading-none tabular-nums text-fg">
            {total}
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wide text-fg-soft">
            {total === 1 ? "issue" : "issues"}
          </span>
        </div>
      </div>

      <ul className="flex min-w-0 flex-col gap-2">
        {SEVERITY_ORDER.map((s) => (
          <li key={s} className="flex items-center gap-2 text-sm">
            <span aria-hidden className={cn("size-2.5 shrink-0 rounded-sm", SEV_DOT[s])} />
            <span className="capitalize text-fg-soft">{s}</span>
            <span className="ml-auto font-bold tabular-nums text-fg">{counts[s]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Trend area — issues discovered per day. Pure SVG.
 * ------------------------------------------------------------------ */
export function TrendArea({ points }: { points: TrendPoint[] }) {
  const W = 720;
  const H = 200;
  const PAD = 6;
  const n = points.length;
  const maxV = Math.max(1, ...points.map((p) => p.total));

  const x = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => PAD + (1 - v / maxV) * (H - PAD * 2);

  const line = (key: "total" | "critical") =>
    points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(" ");

  const area = `${line("total")} L ${x(n - 1).toFixed(1)} ${H} L ${x(0).toFixed(1)} ${H} Z`;
  const hasCritical = points.some((p) => p.critical > 0);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height="200"
      preserveAspectRatio="none"
      aria-hidden
      className="block"
    >
      <defs>
        <linearGradient id="trendfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-blue)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--color-blue)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#trendfill)" />
      <path d={line("total")} fill="none" stroke="var(--color-blue)" strokeWidth="2.5" strokeLinejoin="round" />
      {hasCritical ? (
        <path
          d={line("critical")}
          fill="none"
          stroke="var(--color-pink)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeDasharray="1 0"
        />
      ) : null}
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * Bar list — ranked horizontal bars (top sites / pages / issues).
 * ------------------------------------------------------------------ */
export function BarList({
  items,
}: {
  items: Array<{ key: string; label: ReactNode; value: number; href?: string; barClassName?: string }>;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="flex flex-col gap-3">
      {items.map((it) => {
        const label = (
          <span className="truncate text-sm font-bold text-fg">{it.label}</span>
        );
        return (
          <li key={it.key}>
            <div className="flex items-center justify-between gap-3">
              {it.href ? (
                <Link href={it.href} className="min-w-0 truncate no-underline hover:underline underline-offset-2">
                  {label}
                </Link>
              ) : (
                <span className="min-w-0 truncate">{label}</span>
              )}
              <span className="shrink-0 text-sm font-bold tabular-nums text-fg-soft">{it.value}</span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--color-fg)_8%,transparent)]">
              <div
                className={cn("h-full rounded-full", it.barClassName ?? "bg-blue")}
                style={{ width: `${Math.max(3, (it.value / max) * 100)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
