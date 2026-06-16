import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "yellow" | "pink" | "blue" | "green" | "surface";

const tones: Record<Tone, string> = {
  yellow: "bg-yellow text-[var(--ink)]",
  pink: "bg-pink text-[var(--ink)]",
  blue: "bg-blue text-on-accent",
  green: "bg-green text-on-accent",
  surface: "bg-surface text-fg",
};

/** Small chunky label — section eyebrows, tags, "TBD" markers. */
export function Badge({
  children,
  tone = "yellow",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border-[3px] border-[var(--ink)] px-3 py-1 text-sm font-bold uppercase tracking-wide font-display",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
