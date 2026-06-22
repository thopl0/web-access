import type { Page } from "playwright";
import { PNG } from "pngjs";
import type { Finding } from "@web-access/shared";
import { backgroundContrast, parseRgb, requiredRatio, type RGB } from "./color";
import { ensureEvalHelpers } from "./util";

/** A text element (collected in-page) whose background involves an image or gradient. */
interface TextOverImage {
  selector: string;
  color: string;
  fontSize: number;
  bold: boolean;
  /** Page-relative box in CSS pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  bg: string;
}

/** Collect text elements whose effective background (self or ancestor) is an image/gradient. */
async function collectTextOverImage(page: Page): Promise<TextOverImage[]> {
  await ensureEvalHelpers(page);
  return page.evaluate(() => {
    function cssPath(node: Element): string {
      if (node.id) return `#${CSS.escape(node.id)}`;
      const parts: string[] = [];
      let el: Element | null = node;
      while (el && el.nodeType === 1 && el.tagName !== "HTML") {
        let part = el.tagName.toLowerCase();
        const parent: Element | null = el.parentElement;
        if (parent) {
          const sameTag = Array.from(parent.children).filter((c) => c.tagName === el!.tagName);
          if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(el) + 1})`;
        }
        parts.unshift(part);
        el = parent;
      }
      return parts.join(" > ");
    }

    /** Is a computed background-color fully opaque (alpha === 1)? `rgb(...)` always is. */
    function isOpaqueColor(color: string): boolean {
      const m = /^rgba?\(([^)]+)\)$/.exec(color);
      if (!m) return false; // "transparent" or unparsed → treat as see-through
      const parts = m[1]!.split(",").map((p) => p.trim());
      return parts.length < 4 || parseFloat(parts[3]!) >= 1;
    }

    /**
     * The background IMAGE the text is actually painted over, or null when there is none OR when a
     * nearer opaque background-color hides everything below it. Walking up, the first element that
     * has a background-image wins (it paints over its own color); but if we first hit an element with
     * an OPAQUE background-color, the text sits on a solid color — axe-core already grades that, so it
     * is NOT a "text over image" case and we bail out. This is what stops a readable card on an
     * opaque background from being flagged just because the page behind it has a background image.
     */
    function backgroundImageOf(node: Element): string | null {
      let el: Element | null = node;
      while (el) {
        const style = getComputedStyle(el);
        const bg = style.backgroundImage;
        if (bg && bg !== "none") return bg;
        if (isOpaqueColor(style.backgroundColor)) return null;
        el = el.parentElement;
      }
      return null;
    }

    const out: TextOverImage[] = [];
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      // direct (non-inherited) text only
      const text = Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => (n.textContent ?? "").trim())
        .join("");
      if (!text) continue;

      const bg = backgroundImageOf(el);
      if (!bg) continue;

      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;
      // Skip decorative text: aria-hidden (not in the a11y tree) or effectively invisible via cumulative
      // opacity (e.g. faint watermarks). Contrast on these is noise — Lighthouse ignores them too.
      if (el.closest('[aria-hidden="true"]')) continue;
      let cumulativeOpacity = 1;
      for (let p: Element | null = el; p && p.nodeType === 1; p = p.parentElement) {
        const o = parseFloat(getComputedStyle(p).opacity);
        if (!Number.isNaN(o)) cumulativeOpacity *= o;
      }
      if (cumulativeOpacity < 0.1) continue;

      out.push({
        selector: cssPath(el),
        color: style.color,
        fontSize: parseFloat(style.fontSize) || 16,
        bold: (parseInt(style.fontWeight, 10) || 400) >= 700,
        x: r.x + window.scrollX,
        y: r.y + window.scrollY,
        w: r.width,
        h: r.height,
        bg,
      });
    }
    return out.slice(0, 30); // cap per page
  });
}

/** Crop an RGBA rectangle out of a decoded full-page PNG. */
function crop(png: PNG, x: number, y: number, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  let o = 0;
  for (let row = y; row < y + h; row++) {
    if (row < 0 || row >= png.height) continue;
    for (let col = x; col < x + w; col++) {
      if (col < 0 || col >= png.width) continue;
      const idx = (row * png.width + col) * 4;
      out[o++] = png.data[idx]!;
      out[o++] = png.data[idx + 1]!;
      out[o++] = png.data[idx + 2]!;
      out[o++] = png.data[idx + 3]!;
    }
  }
  return out.subarray(0, o);
}

/**
 * Tier-2 contrast over images/gradients. axe-core already handles solid backgrounds (and returns
 * "incomplete" for image/gradient ones); this fills that gap deterministically via pixel sampling
 * of a real render — no AI. (Dynamic backgrounds: video/parallax remain the Tier-3 residue.)
 */
export async function runContrast(page: Page): Promise<Finding[]> {
  const candidates = await collectTextOverImage(page);
  if (candidates.length === 0) return [];

  const shot = await page.screenshot({ fullPage: true });
  const png = PNG.sync.read(Buffer.from(shot));
  const findings: Finding[] = [];

  for (const c of candidates) {
    const fg: RGB | null = parseRgb(c.color);
    if (!fg) continue;
    const pixels = crop(png, Math.round(c.x), Math.round(c.y), Math.round(c.w), Math.round(c.h));
    const { ratio, sampled } = backgroundContrast(pixels, fg);
    if (sampled < 50 || ratio === Infinity) continue; // not enough background to judge

    const required = requiredRatio(c.fontSize, c.bold);
    if (ratio < required) {
      findings.push({
        ruleId: "contrast-over-image",
        source: "contrast",
        tier: 2,
        wcag: ["1.4.3"],
        impact: "serious",
        selector: c.selector,
        htmlSnippet: `<${c.selector.split(" > ").pop()}> over background-image`,
        message:
          `Text over an image/gradient background has an estimated contrast of ` +
          `${ratio.toFixed(1)}:1 (needs ${required}:1). Measured by sampling rendered pixels.`,
      });
    }
  }
  return findings;
}
