/**
 * Brutalist "world shapes" — the texture of the illustration world (stars,
 * blobs, arrows, squiggles, dots, rings). All decorative: each is wrapped in
 * aria-hidden and carries no meaning. Color comes from `currentColor`, so set
 * it with a text-* utility (e.g. `text-yellow`, `text-[var(--ink)]`). Pair with
 * <Parallax> to make layers drift at different speeds behind a scene.
 */
import type { SVGProps } from "react";

type ShapeProps = SVGProps<SVGSVGElement> & { className?: string };

const base = (props: ShapeProps) => ({
  "aria-hidden": true as const,
  focusable: false as const,
  ...props,
});

/** Four-point twinkle / sparkle. Filled. */
export function Star(props: ShapeProps) {
  return (
    <svg viewBox="0 0 100 100" fill="currentColor" {...base(props)}>
      <path d="M50 0c4 26 20 42 50 50-30 8-46 24-50 50-4-26-20-42-50-50 30-8 46-24 50-50Z" />
    </svg>
  );
}

/** Soft organic blob. Filled. */
export function Blob(props: ShapeProps) {
  return (
    <svg viewBox="0 0 120 120" fill="currentColor" {...base(props)}>
      <path d="M58 4c20-6 44 4 53 24s3 44-12 58-42 22-61 12S6 74 9 52 38 10 58 4Z" />
    </svg>
  );
}

/** Sunburst / spark — radiating spokes. Stroked. */
export function Burst(props: ShapeProps) {
  return (
    <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" {...base(props)}>
      <path d="M50 8v18M50 74v18M8 50h18M74 50h18M20 20l13 13M67 67l13 13M80 20 67 33M33 67 20 80" />
    </svg>
  );
}

/** Hand-drawn looping arrow. Stroked. */
export function Arrow(props: ShapeProps) {
  return (
    <svg viewBox="0 0 120 80" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" {...base(props)}>
      <path d="M6 64C30 18 70 8 108 18" />
      <path d="M88 8l22 10-12 22" />
    </svg>
  );
}

/** Wavy squiggle. Stroked. */
export function Squiggle(props: ShapeProps) {
  return (
    <svg viewBox="0 0 160 40" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" {...base(props)}>
      <path d="M6 22c14-22 28-22 42 0s28 22 42 0 28-22 42 0" />
    </svg>
  );
}

/** Dot grid. Filled. */
export function Dots(props: ShapeProps) {
  return (
    <svg viewBox="0 0 100 100" fill="currentColor" {...base(props)}>
      {[12, 38, 64, 90].map((y) =>
        [12, 38, 64, 90].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="7" />),
      )}
    </svg>
  );
}

/** Concentric ring (outline). Stroked. */
export function Ring(props: ShapeProps) {
  return (
    <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="10" {...base(props)}>
      <circle cx="50" cy="50" r="42" />
    </svg>
  );
}
