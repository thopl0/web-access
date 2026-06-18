import type { Page } from "playwright";
import type { Finding } from "@web-access/shared";
import { ensureEvalHelpers } from "./util";

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
  /** Index of the nearest flex/grid ancestor (the only layout contexts that legitimately reorder
   *  children visually). -1 when none — such elements can't be a source-order inversion. */
  container: number;
  /** False for position:absolute/fixed/sticky — out-of-flow elements are positioned deliberately,
   *  so their DOM order doesn't define a reading-order bug. */
  inFlow: boolean;
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

/** Fraction of the narrower element's width that the two elements share horizontally (0–1). */
function overlapFraction(a: GeomEl, b: GeomEl): number {
  const overlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  if (overlap <= 0) return 0;
  return overlap / Math.max(1, Math.min(a.w, b.w));
}

/**
 * Reading/focus-order divergence (WCAG 1.3.2 / 2.4.3). A source-order inversion can only be created
 * by a flex/grid container reordering its children (block flow always follows DOM order, and
 * absolutely/fixed-positioned elements are placed deliberately). So we only compare elements that
 * share the SAME nearest flex/grid container, are in normal flow, sit in the same column (substantial
 * horizontal overlap), and have a clear vertical gap — then flag when a later-DOM element renders
 * fully above an earlier one. These guards keep ordinary layouts (sticky/fixed bars, multi-column,
 * unrelated regions) from tripping it; earlier versions flagged all of those.
 */
export function detectReadingOrderInversions(els: GeomEl[], maxFindings = 5): Finding[] {
  const GAP = 4; // min vertical clearance, px — shrugs off sub-pixel rounding
  const MIN_OVERLAP = 0.5; // must share ≥half the narrower element's width to count as one column

  // Only in-flow elements that actually live inside a reordering (flex/grid) container can invert.
  const candidates = els.filter((e) => e.inFlow && e.container >= 0);

  // Compare only within the same container, in DOM order.
  const byContainer = new Map<number, GeomEl[]>();
  for (const e of candidates) {
    const list = byContainer.get(e.container);
    if (list) list.push(e);
    else byContainer.set(e.container, [e]);
  }

  const findings: Finding[] = [];
  for (const group of byContainer.values()) {
    if (findings.length >= maxFindings) break;
    group.sort((a, b) => a.domIndex - b.domIndex);
    for (let i = 1; i < group.length && findings.length < maxFindings; i++) {
      const prev = group[i - 1]!;
      const cur = group[i]!;
      if (
        cur.y + cur.h <= prev.y - GAP &&
        overlapFraction(prev, cur) >= MIN_OVERLAP
      ) {
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

    /** Nearest flex/grid ancestor — the only contexts that legitimately reorder children. */
    function flexGridContainer(el: Element): Element | null {
      let p: Element | null = el.parentElement;
      while (p && p.tagName !== "HTML") {
        const d = getComputedStyle(p).display;
        if (d === "flex" || d === "inline-flex" || d === "grid" || d === "inline-grid") return p;
        p = p.parentElement;
      }
      return null;
    }

    const focusable = Array.from(
      document.querySelectorAll<HTMLElement>(
        "a[href], button, input, select, textarea, [tabindex]",
      ),
    );

    const out: GeomEl[] = [];
    for (const el of focusable) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || s.display === "none" || s.opacity === "0") continue;
      // Removed from the a11y tree or visually hidden off-screen → not user-facing, skip entirely.
      if (el.closest('[aria-hidden="true"], [inert]')) continue;
      // Vertical writing modes invert the visual/axis relationship the inversion check assumes.
      if (s.writingMode.startsWith("vertical")) continue;
      const x = r.x + window.scrollX;
      const y = r.y + window.scrollY;
      if (x + r.width <= 0 || y + r.height <= 0) continue; // entirely off the top/left of the doc

      // Strict integer parse: the browser ignores invalid tabindex like "3px", so we must too.
      const tiRaw = el.getAttribute("tabindex");
      const ti = tiRaw !== null && /^[+-]?\d+$/.test(tiRaw.trim()) ? parseInt(tiRaw, 10) : 0;
      const pos = s.position;
      const container = flexGridContainer(el);
      out.push({
        domIndex: indexOf.get(el) ?? 0,
        selector: cssPath(el),
        tag: el.tagName.toLowerCase(),
        tabindex: ti,
        x,
        y,
        w: r.width,
        h: r.height,
        container: container ? (indexOf.get(container) ?? -1) : -1,
        inFlow: pos !== "absolute" && pos !== "fixed" && pos !== "sticky",
      });
    }
    return out;
  });

  return [...detectPositiveTabindex(els), ...detectReadingOrderInversions(els)];
}
