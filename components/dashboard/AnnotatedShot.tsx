import { ImageOff } from "lucide-react";

import type { ElementBox, PageShot } from "@/lib/server/report";
import { cn } from "@/lib/utils";

/**
 * "See it" evidence for an offending element. Three graceful tiers, in order of
 * fidelity:
 *   1. Full-page `shot` + `box` → the page screenshot with a responsive,
 *      percentage-positioned highlight ring over the offending element.
 *   2. An element `crop` (base64 PNG) → just the captured element.
 *   3. Neither → a tidy "no preview" placeholder.
 *
 * The highlight ring is purely decorative (aria-hidden) — colour is never the
 * sole signal; the offending element is always described in text beside this.
 * `box`/`shot` only exist once the worker re-scans with evidence capture, so
 * most sites fall back to tier 2 or 3 until then.
 */
export function AnnotatedShot({
  shot,
  box,
  crop,
  cropWidth,
  cropHeight,
  label,
  className,
}: {
  /** Full-page screenshot to overlay the highlight onto. */
  shot?: PageShot | undefined;
  /** Offending element's box in the shot's CSS-px coordinate space. */
  box?: ElementBox | undefined;
  /** Element crop image URL, used when there's no shot/box. */
  crop?: string | undefined;
  cropWidth?: number | undefined;
  cropHeight?: number | undefined;
  /** Accessible description of what the screenshot shows. */
  label: string;
  className?: string;
}) {
  // Tier 1 — full-page shot with a positioned highlight.
  if (shot && box && shot.width > 0 && shot.height > 0) {
    const pct = (n: number, total: number) => `${Math.max(0, Math.min(100, (n / total) * 100))}%`;
    return (
      <figure className={cn("m-0", className)}>
        {/* The image defines the box; the highlight is positioned as % of it, so they stay aligned.
            The clipper caps height by SCROLLING (never object-contain/letterbox, which would drift). */}
        <div className="max-h-[32rem] overflow-y-auto rounded-lg border border-[var(--inset-line)] bg-white">
          <div className="relative w-full">
            {/* eslint-disable-next-line @next/next/no-img-element -- access-controlled image route, not optimizable */}
            <img src={shot.src} alt={label} className="block h-auto w-full" />
            <span
              aria-hidden
              className="pointer-events-none absolute rounded-sm ring-2 ring-pink ring-offset-0 shadow-[0_0_0_2px_color-mix(in_srgb,var(--color-pink)_35%,transparent)]"
              style={{
                left: pct(box.x, shot.width),
                top: pct(box.y, shot.height),
                width: pct(box.w, shot.width),
                height: pct(box.h, shot.height),
              }}
            />
          </div>
        </div>
        <figcaption className="mt-2 inline-flex items-center gap-1.5 text-xs text-fg-soft">
          <span aria-hidden className="inline-block size-2.5 rounded-sm ring-2 ring-pink" />
          Highlighted in pink: the element to fix
        </figcaption>
      </figure>
    );
  }

  // Tier 2 — element crop only.
  if (crop) {
    return (
      <figure className={cn("m-0", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- access-controlled image route, not optimizable */}
        <img
          src={crop}
          alt={label}
          width={cropWidth}
          height={cropHeight}
          className="block max-h-64 w-auto max-w-full rounded-lg border border-[var(--inset-line)] bg-white"
        />
      </figure>
    );
  }

  // Tier 3 — nothing captured yet.
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--color-panel-line-strong)] bg-[color-mix(in_srgb,var(--color-fg)_3%,transparent)] px-4 py-8 text-center",
        className,
      )}
    >
      <ImageOff className="size-6 text-fg-soft" aria-hidden strokeWidth={2} />
      <p className="text-sm font-bold text-fg">No preview captured</p>
      <p className="max-w-xs text-xs text-fg-soft">
        A screenshot will appear here after the next scan captures this element.
      </p>
    </div>
  );
}
