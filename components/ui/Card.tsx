import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "surface" | "yellow" | "pink" | "blue" | "green";

const tones: Record<Tone, string> = {
  surface: "bg-surface text-fg brut-card",
  yellow: "bg-yellow text-[var(--ink)] brut brut-ink shadow-ink",
  pink: "bg-pink text-[var(--ink)] brut brut-ink shadow-ink",
  blue: "bg-blue text-on-accent brut brut-ink shadow-ink",
  green: "bg-green text-on-accent brut brut-ink shadow-ink",
};

/**
 * Bordered, hard-shadowed panel. `tone` picks the color block; accent tones
 * carry a fixed dark border/shadow so they stay crisp in dark mode.
 * Set `interactive` for the tactile press effect (use on linked/clickable cards).
 */
export function Card({
  children,
  tone = "surface",
  interactive = false,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  interactive?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        tones[tone],
        interactive && "brut-press",
        "p-6 sm:p-8",
        className,
      )}
    >
      {children}
    </div>
  );
}
