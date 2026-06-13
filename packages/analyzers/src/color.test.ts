import { describe, it, expect } from "vitest";
import {
  relativeLuminance,
  contrastRatio,
  requiredRatio,
  parseRgb,
  backgroundContrast,
  type RGB,
} from "./color.js";

const BLACK: RGB = { r: 0, g: 0, b: 0 };
const WHITE: RGB = { r: 255, g: 255, b: 255 };

describe("luminance & contrast", () => {
  it("luminance endpoints", () => {
    expect(relativeLuminance(BLACK)).toBeCloseTo(0, 5);
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 5);
  });

  it("black vs white is 21:1", () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 1);
  });

  it("same color is 1:1 and is symmetric", () => {
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 5);
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(contrastRatio(WHITE, BLACK), 5);
  });
});

describe("requiredRatio", () => {
  it("normal text needs 4.5", () => {
    expect(requiredRatio(16, false)).toBe(4.5);
    expect(requiredRatio(23, false)).toBe(4.5);
  });
  it("large text needs 3", () => {
    expect(requiredRatio(24, false)).toBe(3);
    expect(requiredRatio(19, true)).toBe(3); // bold ≥18.66
  });
});

describe("parseRgb", () => {
  it("parses rgb and rgba", () => {
    expect(parseRgb("rgb(12, 34, 56)")).toEqual({ r: 12, g: 34, b: 56 });
    expect(parseRgb("rgba(255, 0, 0, 0.5)")).toEqual({ r: 255, g: 0, b: 0 });
  });
  it("returns null for gradients/keywords", () => {
    expect(parseRgb("linear-gradient(#000, #fff)")).toBeNull();
  });
});

describe("backgroundContrast", () => {
  // helper to build an RGBA buffer from a list of opaque colors
  const buf = (colors: RGB[]) => {
    const a = new Uint8Array(colors.length * 4);
    colors.forEach((c, i) => {
      a[i * 4] = c.r;
      a[i * 4 + 1] = c.g;
      a[i * 4 + 2] = c.b;
      a[i * 4 + 3] = 255;
    });
    return a;
  };

  it("light text on a mostly-dark background passes", () => {
    const bg = buf([BLACK, BLACK, BLACK, { r: 20, g: 20, b: 20 }]);
    const res = backgroundContrast(bg, WHITE);
    expect(res.sampled).toBeGreaterThan(0);
    expect(res.ratio).toBeGreaterThan(4.5);
  });

  it("light text on a mostly-light background fails", () => {
    const bg = buf([{ r: 240, g: 240, b: 240 }, WHITE, { r: 230, g: 230, b: 230 }]);
    const res = backgroundContrast(bg, WHITE);
    expect(res.ratio).toBeLessThan(4.5);
  });

  it("excludes pixels near the foreground color (glyphs)", () => {
    // all pixels equal the fg → nothing counts as background
    const res = backgroundContrast(buf([WHITE, WHITE]), WHITE);
    expect(res.sampled).toBe(0);
    expect(res.ratio).toBe(Infinity);
  });
});
