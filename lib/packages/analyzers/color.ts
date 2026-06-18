export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** WCAG relative luminance of an sRGB color (channels 0–255). */
export function relativeLuminance({ r, g, b }: RGB): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two colors (always >= 1). */
export function contrastRatio(a: RGB, b: RGB): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * WCAG 1.4.3 minimum ratio for the given text metrics. Large text (≥24px, or ≥18.66px bold) only
 * needs 3:1; everything else 4.5:1.
 */
export function requiredRatio(fontSizePx: number, bold: boolean): number {
  const isLarge = fontSizePx >= 24 || (bold && fontSizePx >= 18.66);
  return isLarge ? 3 : 4.5;
}

/** Parse "rgb(r, g, b)" / "rgba(r, g, b, a)" → RGB, or null if not a plain color (e.g. a gradient). */
export function parseRgb(s: string): RGB | null {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(s);
  if (!m) return null;
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
}

/** Manhattan distance between two colors (0–765); used to drop glyph pixels near the text color. */
function colorDistance(a: RGB, b: RGB): number {
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}

export interface BackgroundContrastResult {
  /** Worst contrast among the SUBSTANTIAL background colour regions vs the text colour.
   *  `Infinity` when no region was large enough to judge confidently. */
  ratio: number;
  /** How many pixels were treated as background (after excluding glyph pixels). */
  sampled: number;
}

/**
 * Given the RGBA pixels of a text element's rendered box and its foreground colour, estimate the
 * worst contrast the text has against its (image/gradient) background.
 *
 * Per-pixel sampling is unreliable: anti-aliasing produces a halo of intermediate-luminance pixels
 * along every glyph edge, and multi-coloured text contributes off-colour pixels — both look like
 * "low-contrast background" and create false positives on perfectly readable text. Instead we
 * cluster the (non-glyph) pixels into a coarse colour histogram and only consider buckets that each
 * cover a meaningful FRACTION of the area. Real background regions form big clusters; anti-alias
 * halos and stray glyph colours spread thinly across many buckets and are ignored. We then report
 * the worst contrast among the substantial regions. If nothing is substantial enough (text fills the
 * box, only edges remain) we return Infinity — we'd rather say nothing than cry wolf.
 *
 * This is the deterministic Tier-2 pixel-sampling method (no AI) from the plan.
 */
export function backgroundContrast(
  rgba: Uint8Array | Uint8ClampedArray,
  fg: RGB,
  opts: { excludeNearFg?: number; minFraction?: number } = {},
): BackgroundContrastResult {
  const exclude = opts.excludeNearFg ?? 48;
  const minFraction = opts.minFraction ?? 0.12;

  // 5-bit-per-channel histogram of background pixels, accumulating true averages per bucket.
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  let total = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3]! < 200) continue; // skip mostly-transparent pixels
    const r = rgba[i]!;
    const g = rgba[i + 1]!;
    const b = rgba[i + 2]!;
    if (colorDistance({ r, g, b }, fg) < exclude) continue; // glyph / heavy anti-alias
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const e = buckets.get(key);
    if (e) {
      e.count++;
      e.r += r;
      e.g += g;
      e.b += b;
    } else {
      buckets.set(key, { count: 1, r, g, b });
    }
    total++;
  }
  if (total === 0) return { ratio: Infinity, sampled: 0 };

  const minCount = total * minFraction;
  let worst = Infinity;
  for (const e of buckets.values()) {
    if (e.count < minCount) continue; // too small to be a real background region
    const avg: RGB = { r: e.r / e.count, g: e.g / e.count, b: e.b / e.count };
    const ratio = contrastRatio(avg, fg);
    if (ratio < worst) worst = ratio;
  }
  return { ratio: worst, sampled: total };
}
