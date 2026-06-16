"use client";

import { motion, useReducedMotion } from "motion/react";
import { useSyncExternalStore, type ReactNode } from "react";

type Direction = "up" | "down" | "left" | "right" | "none";

// Returns false during SSR + the first client render, true once hydrated — the
// effect-free, lint-clean way to know JS is running. Drives the PE gate below.
const emptySubscribe = () => () => {};
const useHydrated = () =>
  useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

const OFFSET = 24;
const offsets: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: OFFSET },
  down: { x: 0, y: -OFFSET },
  left: { x: OFFSET, y: 0 },
  right: { x: -OFFSET, y: 0 },
  none: { x: 0, y: 0 },
};

/**
 * Scroll-triggered reveal. Fades + slides a small distance on viewport entry,
 * once. When the user prefers reduced motion the content renders in place with
 * no transform and no fade-from-offset — the content is there in place.
 */
export function Reveal({
  children,
  direction = "up",
  delay = 0,
  className,
  as = "div",
}: {
  children: ReactNode;
  direction?: Direction;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li" | "span";
}) {
  const reduced = useReducedMotion();
  const { x, y } = offsets[direction];
  const MotionTag = motion[as];

  // Progressive enhancement: the server, the no-JS client, the reduced-motion
  // user, and the first paint before hydration ALL render the content plainly
  // and fully visible. The hidden→reveal entrance is layered on only after the
  // component hydrates with JS, so content is never gated behind motion.
  const hydrated = useHydrated();

  if (reduced || !hydrated) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }

  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0, x, y }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </MotionTag>
  );
}
