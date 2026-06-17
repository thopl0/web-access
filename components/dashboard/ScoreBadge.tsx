import type { SeverityCounts } from "@/lib/severity";
import { grade, healthScore } from "@/lib/score";
import { cn } from "@/lib/utils";

const TONE_RING: Record<"green" | "yellow" | "pink", string> = {
  green: "border-green text-green",
  yellow: "border-yellow text-[color-mix(in_srgb,var(--color-fg)_55%,var(--yellow))]",
  pink: "border-pink text-pink",
};

/**
 * Accessibility health score + letter grade. `size="lg"` is the prominent overview headline;
 * `size="sm"` is the inline pill used on site cards. Pure/server-safe.
 */
export function ScoreBadge({
  counts,
  pageCount,
  size = "lg",
}: {
  counts: SeverityCounts;
  pageCount: number;
  size?: "sm" | "lg";
}) {
  const score = healthScore(counts, pageCount);
  const g = grade(score);

  if (size === "sm") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-0.5 text-xs font-bold",
          TONE_RING[g.tone],
        )}
        title={`Accessibility score ${score}/100`}
      >
        <span className="font-display">{g.letter}</span>
        <span className="tabular-nums">{score}</span>
      </span>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <div
        className={cn(
          "flex size-16 shrink-0 items-center justify-center rounded-full border-4 font-display text-3xl font-bold",
          TONE_RING[g.tone],
        )}
      >
        {g.letter}
      </div>
      <div>
        <p className="font-display text-2xl font-bold tabular-nums text-fg">{score}/100</p>
        <p className="text-sm text-fg-soft">Accessibility score</p>
      </div>
    </div>
  );
}
