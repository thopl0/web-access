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

/** Parse a hex (`#rgb`/`#rrggbb`) or `rgb()` color string → RGB, or null. */
export function parseColor(s: string): RGB | null {
  const t = s.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(t);
  if (hex) {
    const h = hex[1]!;
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    return { r: parseInt(full.slice(0, 2), 16), g: parseInt(full.slice(2, 4), 16), b: parseInt(full.slice(4, 6), 16) };
  }
  return parseRgb(t);
}

/** Format an RGB as a `#rrggbb` hex string (channels clamped + rounded). */
export function toHex({ r, g, b }: RGB): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function lerp(a: RGB, b: RGB, t: number): RGB {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

/** Smallest blend factor t∈[0,1] s.t. lerp(fg→target, t) meets `ratio` against bg, or null if even t=1 can't. */
function minBlendToRatio(fg: RGB, bg: RGB, target: RGB, ratio: number): number | null {
  if (contrastRatio(fg, bg) >= ratio) return 0;
  if (contrastRatio(target, bg) < ratio) return null;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (contrastRatio(lerp(fg, target, mid), bg) >= ratio) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * Nudge a foreground color toward black or white — whichever gets there with the LEAST visual change —
 * until it meets `ratio` against `bg`. Used to compute an experimental contrast fix that stays as close
 * as possible to the owner's original color. Falls back to the higher-contrast extreme if neither
 * direction can reach the ratio (e.g. a mid-gray background where the target is very high).
 */
export function compliantTextColor(fg: RGB, bg: RGB, ratio: number): RGB {
  const black: RGB = { r: 0, g: 0, b: 0 };
  const white: RGB = { r: 255, g: 255, b: 255 };
  const tDark = minBlendToRatio(fg, bg, black, ratio);
  const tLight = minBlendToRatio(fg, bg, white, ratio);
  if (tDark === null && tLight === null) {
    return contrastRatio(black, bg) >= contrastRatio(white, bg) ? black : white;
  }
  if (tDark === null) return lerp(fg, white, tLight!);
  if (tLight === null) return lerp(fg, black, tDark!);
  return tDark <= tLight ? lerp(fg, black, tDark) : lerp(fg, white, tLight);
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
