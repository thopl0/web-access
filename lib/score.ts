import type { SeverityCounts } from "@/lib/severity";

/**
 * A simple, interpretable accessibility health score (0–100) + letter grade, derived from the
 * severity mix normalized per page. Heavier severities deduct more; a site with no issues scores
 * 100. Pure + client-safe so cards, the overview, and site pages all grade consistently.
 */
const WEIGHTS = { critical: 10, serious: 4, moderate: 2, minor: 1 } as const;

export function healthScore(counts: SeverityCounts, pageCount: number): number {
  if (pageCount <= 0) return 100;
  const weighted =
    counts.critical * WEIGHTS.critical +
    counts.serious * WEIGHTS.serious +
    counts.moderate * WEIGHTS.moderate +
    counts.minor * WEIGHTS.minor;
  const perPage = weighted / pageCount;
  return Math.max(0, Math.min(100, Math.round(100 - perPage * 2.5)));
}

export type Grade = { letter: string; tone: "green" | "yellow" | "pink" };

export function grade(score: number): Grade {
  if (score >= 90) return { letter: "A", tone: "green" };
  if (score >= 75) return { letter: "B", tone: "green" };
  if (score >= 60) return { letter: "C", tone: "yellow" };
  if (score >= 40) return { letter: "D", tone: "yellow" };
  return { letter: "F", tone: "pink" };
}

/** True when nothing critical or serious is open — a reasonable "WCAG AA-ready" signal. */
export function isAaReady(counts: SeverityCounts): boolean {
  return counts.critical === 0 && counts.serious === 0;
}
