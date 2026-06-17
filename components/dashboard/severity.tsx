import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { SEVERITY_ORDER, type Severity, type SeverityCounts } from "@/lib/severity";

type Tone = "surface" | "yellow" | "pink" | "blue" | "green";

/** Severity → visual treatment. Highest harm reads hottest. */
const SEVERITY: Record<Severity, { label: string; tone: Tone; swatch: string }> = {
  critical: { label: "Critical", tone: "pink", swatch: "bg-pink" },
  serious: { label: "Serious", tone: "yellow", swatch: "bg-yellow" },
  moderate: { label: "Moderate", tone: "blue", swatch: "bg-blue" },
  // Minor gets a neutral swatch so the hot colors stay reserved for real harm.
  minor: { label: "Minor", tone: "surface", swatch: "bg-[var(--color-fg-soft)]" },
};

export function severityTone(s: Severity | null): Tone {
  return s ? SEVERITY[s].tone : "surface";
}

export function severityLabel(s: Severity | null): string {
  return s ? SEVERITY[s].label : "Advisory";
}

export function SeverityBadge({ severity }: { severity: Severity | null }) {
  return <Badge tone={severityTone(severity)}>{severityLabel(severity)}</Badge>;
}

/** Small decorative color swatch keyed to a severity. Purely visual; pair with text. */
export function SeverityDot({ severity }: { severity: Severity }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-sm", SEVERITY[severity].swatch)}
    />
  );
}

/**
 * Horizontal stacked bar showing the severity mix at a glance. Decorative — the
 * accessible breakdown lives in the numbers/legend beside it, so this is hidden
 * from assistive tech. When there are no issues it reads as a calm "clean" track.
 */
export function SeverityBar({
  counts,
  muted = false,
  className,
}: {
  counts: SeverityCounts;
  /** No completed scan yet — show an empty neutral track, not the "clean" green. */
  muted?: boolean;
  className?: string;
}) {
  const clean = counts.total === 0;
  return (
    <div
      aria-hidden
      className={cn(
        "flex h-2.5 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--color-fg)_8%,transparent)]",
        className,
      )}
    >
      {muted ? null : clean ? (
        <span className="h-full w-full bg-green/70" />
      ) : (
        SEVERITY_ORDER.map((sev) =>
          counts[sev] > 0 ? (
            <span
              key={sev}
              className={cn("h-full", SEVERITY[sev].swatch)}
              style={{ width: `${(counts[sev] / counts.total) * 100}%` }}
            />
          ) : null,
        )
      )}
    </div>
  );
}

type StatusKey = "none" | "queued" | "running" | "complete" | "error";

const STATUS: Record<StatusKey, { label: string; dot: string }> = {
  complete: { label: "Up to date", dot: "bg-green" },
  running: { label: "Scanning", dot: "bg-blue" },
  queued: { label: "Queued", dot: "bg-yellow" },
  error: { label: "Scan error", dot: "bg-pink" },
  none: { label: "No scans yet", dot: "bg-[var(--color-fg-soft)]" },
};

/** Pill conveying scan posture: a colored dot + plain-language label. The dot is
 *  decorative; the label carries the meaning, so it works without color. */
export function StatusChip({ status, className }: { status: StatusKey; className?: string }) {
  const s = STATUS[status] ?? STATUS.none;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-[var(--color-panel-line-strong)] px-3 py-1 text-xs font-bold text-fg",
        className,
      )}
    >
      <span aria-hidden className={cn("size-2 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}

/** One number + label cell, with an optional severity dot. */
function StatCell({
  value,
  label,
  severity,
  emphasize = false,
}: {
  value: ReactNode;
  label: string;
  severity?: Severity;
  emphasize?: boolean;
}) {
  const zero = value === 0;
  return (
    <div className="px-4 py-3 sm:px-5 sm:py-4">
      <div
        className={cn(
          "font-display font-bold leading-none tabular-nums",
          emphasize ? "text-3xl sm:text-4xl" : "text-2xl sm:text-3xl",
          zero ? "text-fg-soft" : "text-fg",
        )}
      >
        {value}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-fg-soft">
        {severity ? <SeverityDot severity={severity} /> : null}
        {label}
      </div>
    </div>
  );
}

/**
 * Site-wide summary band: a unified panel with a total + per-severity breakdown
 * and a proportion bar. Replaces the old wall of solid color tiles — same data,
 * far calmer, and the numbers stay in high-contrast --fg (colors are accents).
 */
export function SeveritySummary({
  counts,
  pageCount,
}: {
  counts: SeverityCounts;
  pageCount: number;
}) {
  return (
    <section aria-label="Issue summary" className="panel overflow-hidden">
      <div className="grid grid-cols-2 divide-x divide-y divide-[var(--color-panel-line)] sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
        <StatCell value={counts.total} label="Issues" emphasize />
        <StatCell value={counts.critical} label="Critical" severity="critical" />
        <StatCell value={counts.serious} label="Serious" severity="serious" />
        <StatCell value={counts.moderate} label="Moderate" severity="moderate" />
        <StatCell value={counts.minor} label="Minor" severity="minor" />
        <StatCell value={pageCount} label={pageCount === 1 ? "Page" : "Pages"} />
      </div>
      <div className="border-t border-[var(--color-panel-line)] px-4 py-4 sm:px-5">
        <SeverityBar counts={counts} />
      </div>
    </section>
  );
}
