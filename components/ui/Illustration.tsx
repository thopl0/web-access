import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Brutalist frame: bold border + hard shadow + flat color ground. Wrap any
 * illustration/figure so sourced art (unDraw, etc.) reads as part of the system.
 */
export function Frame({
  children,
  tone = "surface",
  className,
}: {
  children: ReactNode;
  tone?: "surface" | "yellow" | "pink" | "blue" | "green";
  className?: string;
}) {
  const grounds: Record<string, string> = {
    surface: "bg-surface brut-card",
    yellow: "bg-yellow brut brut-ink shadow-ink",
    pink: "bg-pink brut brut-ink shadow-ink",
    blue: "bg-blue brut brut-ink shadow-ink",
    green: "bg-green brut brut-ink shadow-ink",
  };
  return (
    <div className={cn(grounds[tone], "overflow-hidden", className)}>
      {children}
    </div>
  );
}

/**
 * Framed illustration.
 * - Decorative art: pass `decorative` → rendered with empty alt + aria-hidden.
 * - Meaningful art: pass a real `alt` describing the content.
 * `src` is a path under /public (e.g. "/illustrations/scan.svg").
 */
export function Illustration({
  src,
  alt,
  decorative = false,
  tone = "surface",
  className,
  imgClassName,
}: {
  src: string;
  alt?: string;
  decorative?: boolean;
  tone?: "surface" | "yellow" | "pink" | "blue" | "green";
  className?: string;
  imgClassName?: string;
}) {
  return (
    <Frame tone={tone} className={cn("p-5 sm:p-8", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- local decorative SVGs; next/image adds no value here */}
      <img
        src={src}
        alt={decorative ? "" : (alt ?? "")}
        aria-hidden={decorative || undefined}
        className={cn("mx-auto block h-auto w-full", imgClassName)}
        loading="lazy"
        decoding="async"
      />
    </Frame>
  );
}

/**
 * Clearly-marked placeholder for spots where no good free asset was found yet.
 * Always decorative; never ships a "real-looking" fake.
 */
export function IllustrationPlaceholder({
  label = "Illustration placeholder",
  tone = "surface",
  className,
}: {
  label?: string;
  tone?: "surface" | "yellow" | "pink" | "blue" | "green";
  className?: string;
}) {
  return (
    <Frame
      tone={tone}
      className={cn(
        "flex min-h-48 items-center justify-center p-6 text-center",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="font-display text-sm font-bold uppercase tracking-wide text-[var(--ink)] opacity-70"
      >
        {label}
      </span>
    </Frame>
  );
}
