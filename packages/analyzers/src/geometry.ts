import type { Page } from "playwright";
import type { Finding } from "@web-access/shared";
import { ensureEvalHelpers } from "./util.js";

/** A focusable element with its page-relative geometry, collected in-page. */
export interface GeomEl {
  domIndex: number;
  selector: string;
  tag: string;
  tabindex: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Positive tabindex forces an unnatural focus order (WCAG 2.4.3). Deterministic DOM check. */
export function detectPositiveTabindex(els: GeomEl[]): Finding[] {
  return els
    .filter((e) => e.tabindex > 0)
    .map((e) => ({
      ruleId: "positive-tabindex",
      source: "geometry" as const,
      tier: 1 as const,
      wcag: ["2.4.3"],
      impact: "serious" as const,
      selector: e.selector,
      htmlSnippet: `<${e.tag} tabindex="${e.tabindex}">`,
      message: `Positive tabindex (${e.tabindex}) forces an unnatural focus order; use 0 or rely on DOM order.`,
    }));
}

function horizontallyOverlap(a: GeomEl, b: GeomEl): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w;
}

/**
 * Reading/focus-order divergence (WCAG 1.3.2 / 2.4.3). Compares DOM order against visual position:
 * if an element that comes LATER in the DOM sits entirely ABOVE an earlier one in the same column,
 * the visual order contradicts the DOM/reading order (classic CSS `order`/`flex-reverse` bug).
 * Requiring same-column overlap keeps multi-column layouts from producing false positives.
 */
export function detectReadingOrderInversions(els: GeomEl[], maxFindings = 5): Finding[] {
  const sorted = [...els].sort((a, b) => a.domIndex - b.domIndex);
  const findings: Finding[] = [];
  const TOL = 4;
  for (let i = 1; i < sorted.length && findings.length < maxFindings; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (cur.y + cur.h <= prev.y - TOL && horizontallyOverlap(prev, cur)) {
      findings.push({
        ruleId: "reading-order",
        source: "geometry",
        tier: 2,
        wcag: ["1.3.2", "2.4.3"],
        impact: "moderate",
        selector: cur.selector,
        htmlSnippet: `<${cur.tag}>`,
        message:
          "This element is rendered visually above an element that precedes it in the DOM, so " +
          "reading/focus order may not match the visual order (e.g. CSS order / flex-reverse).",
      });
    }
  }
  return findings;
}

/** Tier-2: collect focusable-element geometry from a rendered page and run the order detectors. */
export async function runGeometry(page: Page): Promise<Finding[]> {
  await ensureEvalHelpers(page);
  const els: GeomEl[] = await page.evaluate(() => {
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

    const all = Array.from(document.querySelectorAll("*"));
    const indexOf = new Map<Element, number>();
    all.forEach((e, i) => indexOf.set(e, i));

    const focusable = Array.from(
      document.querySelectorAll<HTMLElement>(
        "a[href], button, input, select, textarea, [tabindex]",
      ),
    );

    const out: GeomEl[] = [];
    for (const el of focusable) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || s.display === "none") continue;
      const tiRaw = el.getAttribute("tabindex");
      const ti = tiRaw === null ? 0 : parseInt(tiRaw, 10);
      out.push({
        domIndex: indexOf.get(el) ?? 0,
        selector: cssPath(el),
        tag: el.tagName.toLowerCase(),
        tabindex: Number.isNaN(ti) ? 0 : ti,
        x: r.x + window.scrollX,
        y: r.y + window.scrollY,
        w: r.width,
        h: r.height,
      });
    }
    return out;
  });

  return [...detectPositiveTabindex(els), ...detectReadingOrderInversions(els)];
}
