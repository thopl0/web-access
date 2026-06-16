/**
 * Illustrations — sourced art from **Open Doodles** (https://www.opendoodles.com),
 * released into the public domain (CC0): free for commercial + personal use, no
 * attribution required. Source SVGs taken from the `lunahq/react-open-doodles`
 * mirror (MIT) and recolored to this site's palette (see README).
 *
 * Each doodle is built from just two colors — `ink` (linework) + one flat
 * `accent` — so it recolors cleanly to the palette and reads as one cohesive,
 * bold world. The recolored SVGs are inlined per-doodle under ./inline (linework
 * → `currentColor`, accent → a palette token), so the art floats FRAME-FREE on
 * the page and its lines adapt to whatever ground it sits on. They animate with a
 * gentle idle drift (see <Doodle>). All are decorative (aria-hidden).
 *
 * Concept-based names (BrowserScan, FindingsReport, …) are kept stable so the
 * pages that place them don't need to know which doodle they map to.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Parallax } from "@/components/motion/Parallax";
import { Doodle } from "./Doodle";
import { Star, Blob, Burst, Squiggle, Dots, Ring } from "./shapes";

import browserScan from "./inline/browser-scan";
import findingsReport from "./inline/findings-report";
import fixPass from "./inline/fix-pass";
import contrastEye from "./inline/contrast-eye";
import keyboardNav from "./inline/keyboard-nav";
import assistiveWaves from "./inline/assistive-waves";
import envelopeSend from "./inline/envelope-send";
import signpost from "./inline/signpost";
import heroFloat from "./inline/hero-float";
import proofChilling from "./inline/proof-chilling";
import ctaJumping from "./inline/cta-jumping";

/** Shared props for every concept component — forwarded straight to <Doodle>. */
type DoodleProps = {
  className?: string;
  /** Linework color class. Default `text-fg` (flips). Use `text-on-accent` on
   *  blue/green grounds, `text-[var(--ink)]` on pink/yellow. */
  ink?: string;
  seed?: number;
  float?: boolean;
};

// --- The 8 stable concept components (used across every page) ----------------
export function BrowserScan(p: DoodleProps) {
  return <Doodle svg={browserScan} seed={1} {...p} />;
}
export function FindingsReport(p: DoodleProps) {
  return <Doodle svg={findingsReport} seed={2} {...p} />;
}
export function FixPass(p: DoodleProps) {
  return <Doodle svg={fixPass} seed={3} {...p} />;
}
export function ContrastEye(p: DoodleProps) {
  return <Doodle svg={contrastEye} seed={4} {...p} />;
}
export function KeyboardNav(p: DoodleProps) {
  return <Doodle svg={keyboardNav} seed={5} {...p} />;
}
export function AssistiveWaves(p: DoodleProps) {
  return <Doodle svg={assistiveWaves} seed={6} {...p} />;
}
export function EnvelopeSend(p: DoodleProps) {
  return <Doodle svg={envelopeSend} seed={7} {...p} />;
}
export function Signpost(p: DoodleProps) {
  return <Doodle svg={signpost} seed={8} {...p} />;
}

// --- Extra scenes for the home page's oversized, illustration-led bands ------
export function HeroScene(p: DoodleProps) {
  return <Doodle svg={heroFloat} seed={0} {...p} />;
}
export function ProofScene(p: DoodleProps) {
  return <Doodle svg={proofChilling} seed={9} {...p} />;
}
export function CtaScene(p: DoodleProps) {
  return <Doodle svg={ctaJumping} seed={10} {...p} />;
}

/**
 * A layered, DOMINANT illustration block. The doodle (passed as `children`)
 * floats free — no frame — while decorative "world-shapes" drift on parallax
 * layers behind it, and an optional brutalist `prop` (e.g. a report card) breaks
 * past a corner. `variant` picks a preset shape arrangement; pass `decoration`
 * to override. Reduced motion: every layer renders static, in place.
 */
export function IllustrationScene({
  children,
  variant = "a",
  prop,
  propClassName,
  decoration,
  className,
}: {
  children: ReactNode;
  variant?: "a" | "b" | "c";
  prop?: ReactNode;
  propClassName?: string;
  decoration?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      {/* Decorative world-shape texture; behind the doodle, drifts on scroll. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {decoration ?? <SceneDecoration variant={variant} />}
      </div>

      <div className="relative">{children}</div>

      {prop ? (
        <div className={cn("absolute z-10", propClassName)}>{prop}</div>
      ) : null}
    </div>
  );
}

/** Preset parallax shape arrangements behind a scene. Decorative. */
function SceneDecoration({ variant }: { variant: "a" | "b" | "c" }) {
  if (variant === "b") {
    return (
      <>
        <Parallax speed={34} className="absolute -left-7 top-2">
          <Blob className="size-24 text-pink" />
        </Parallax>
        <Parallax speed={-22} className="absolute -right-6 top-1/3">
          <Star className="size-16 text-yellow" />
        </Parallax>
        <Parallax speed={20} className="absolute -bottom-5 left-1/4">
          <Squiggle className="w-28 text-[var(--ink)]" />
        </Parallax>
      </>
    );
  }
  if (variant === "c") {
    return (
      <>
        <Parallax speed={28} className="absolute -right-8 -top-7">
          <Burst className="size-20 text-green" />
        </Parallax>
        <Parallax speed={-26} className="absolute -left-6 bottom-8">
          <Ring className="size-20 text-blue" />
        </Parallax>
        <Parallax speed={18} className="absolute -bottom-6 right-1/4">
          <Dots className="size-16 text-[var(--ink)]" />
        </Parallax>
      </>
    );
  }
  return (
    <>
      <Parallax speed={30} className="absolute -right-8 -top-8">
        <Star className="size-20 text-yellow" />
      </Parallax>
      <Parallax speed={-24} className="absolute -left-7 bottom-10">
        <Blob className="size-24 text-blue" />
      </Parallax>
      <Parallax speed={16} className="absolute -bottom-6 right-12">
        <Dots className="size-16 text-pink" />
      </Parallax>
    </>
  );
}
