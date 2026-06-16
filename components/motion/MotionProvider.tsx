"use client";

import { MotionConfig } from "motion/react";

/**
 * Global motion wrapper. `reducedMotion="user"` makes every motion component
 * honor prefers-reduced-motion automatically — transform/layout animations are
 * skipped while opacity still settles. Paired with the CSS rule in globals.css
 * and the explicit checks in Reveal/Parallax, this guarantees no content is
 * ever gated behind movement.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
