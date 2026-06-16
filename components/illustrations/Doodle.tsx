"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * A single frameless Open Doodle. The art floats free on the page — no mat, no
 * border — and breathes with a gentle idle drift (whole-figure bob + a touch of
 * sway). The linework is `currentColor`, so the `ink` class decides how the
 * lines read against whatever ground the doodle sits on:
 *   - neutral grounds (page/card/surface): `text-fg` (flips dark↔light)
 *   - light accents (pink/yellow): `text-[var(--ink)]`
 *   - dark accents (blue/green): `text-on-accent`
 * The accent FILL is baked into the SVG. All doodles are decorative (aria-hidden).
 *
 * Reduced motion: renders completely static, in place. The SVG is server-rendered
 * inline, so the art is present without JS — only the idle drift needs it.
 */
export function Doodle({
  svg,
  ink = "text-fg",
  className,
  seed = 0,
  float = true,
}: {
  svg: string;
  ink?: string;
  className?: string;
  /** Varies the idle timing so a group of doodles doesn't bob in lockstep. */
  seed?: number;
  float?: boolean;
}) {
  const reduced = useReducedMotion();

  const art = (
    <span
      aria-hidden="true"
      className={cn(
        "block h-full w-full [&_svg]:block [&_svg]:h-auto [&_svg]:w-full",
        ink,
      )}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );

  if (reduced || !float) {
    return <div className={className}>{art}</div>;
  }

  const range = 8 + (seed % 3) * 3; // 8 / 11 / 14 px
  const tilt = seed % 2 === 0 ? 1.4 : -1.4;
  const duration = 5 + (seed % 4) * 0.7; // 5 – 7.1s
  const delay = (seed % 5) * 0.25;

  return (
    <motion.div
      className={className}
      animate={{ y: [0, -range, 0], rotate: [0, tilt, 0] }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    >
      {art}
    </motion.div>
  );
}
