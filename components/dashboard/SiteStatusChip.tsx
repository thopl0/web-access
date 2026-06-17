import type { SiteStatus } from "@web-access/shared";
import { cn } from "@/lib/utils";

/**
 * Site lifecycle pill (distinct from severity's scan-status chip): conveys whether the embed has
 * been confirmed live. The dot is decorative — the label carries the meaning, so it works without
 * color. Pure/server-safe so cards and the overview can render it without client JS.
 */
const SITE_STATUS: Record<SiteStatus, { label: string; dot: string }> = {
  verified: { label: "Verified", dot: "bg-green" },
  pending: { label: "Awaiting install", dot: "bg-yellow" },
  paused: { label: "Paused", dot: "bg-[var(--color-fg-soft)]" },
};

export function SiteStatusChip({
  status,
  className,
}: {
  status: SiteStatus;
  className?: string;
}) {
  const s = SITE_STATUS[status] ?? SITE_STATUS.pending;
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
