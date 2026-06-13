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
  /** Robust near-worst-case contrast of background pixels vs the text color. */
  ratio: number;
  /** How many pixels were treated as background (after excluding glyph pixels). */
  sampled: number;
}

/**
 * Given the RGBA pixels of a text element's rendered box and its foreground color, estimate the
 * worst-case contrast the text has against its (image/gradient) background.
 *
 * We can't cleanly separate glyph pixels from background in a screenshot that already has text, so
 * we (a) drop pixels close to the foreground color (the glyphs + heavy anti-alias) and (b) report a
 * low percentile rather than the absolute minimum, to shrug off stray anti-aliased edge pixels.
 * This is the deterministic Tier-2 pixel-sampling method (no AI) from the plan.
 */
export function backgroundContrast(
  rgba: Uint8Array | Uint8ClampedArray,
  fg: RGB,
  opts: { excludeNearFg?: number; percentile?: number } = {},
): BackgroundContrastResult {
  const exclude = opts.excludeNearFg ?? 48;
  const percentile = opts.percentile ?? 5;
  const ratios: number[] = [];
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3]! < 200) continue; // skip mostly-transparent pixels
    const px: RGB = { r: rgba[i]!, g: rgba[i + 1]!, b: rgba[i + 2]! };
    if (colorDistance(px, fg) < exclude) continue; // glyph / heavy anti-alias
    ratios.push(contrastRatio(px, fg));
  }
  if (ratios.length === 0) return { ratio: Infinity, sampled: 0 };
  ratios.sort((x, y) => x - y);
  const idx = Math.min(ratios.length - 1, Math.floor((percentile / 100) * ratios.length));
  return { ratio: ratios[idx]!, sampled: ratios.length };
}
