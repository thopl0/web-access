import { describe, it, expect } from "vitest";
import {
  detectPositiveTabindex,
  detectReadingOrderInversions,
  type GeomEl,
} from "./geometry.js";

const el = (over: Partial<GeomEl>): GeomEl => ({
  domIndex: 0,
  selector: "x",
  tag: "div",
  tabindex: 0,
  x: 0,
  y: 0,
  w: 100,
  h: 20,
  ...over,
});

describe("detectPositiveTabindex", () => {
  it("flags only tabindex > 0", () => {
    const out = detectPositiveTabindex([
      el({ tabindex: 0 }),
      el({ tabindex: -1, selector: "a" }),
      el({ tabindex: 3, selector: "b", tag: "input" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ ruleId: "positive-tabindex", selector: "b", wcag: ["2.4.3"] });
  });
});

describe("detectReadingOrderInversions", () => {
  it("flags a later-DOM element rendered above an earlier one in the same column", () => {
    // DOM order A(top-index 0) then B(index 1); but B is positioned ABOVE A → inversion
    const a = el({ domIndex: 0, selector: "A", x: 0, y: 100, w: 100, h: 20 });
    const b = el({ domIndex: 1, selector: "B", x: 0, y: 0, w: 100, h: 20 });
    const out = detectReadingOrderInversions([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ ruleId: "reading-order", selector: "B", tier: 2 });
  });

  it("does not flag normal top-to-bottom order", () => {
    const a = el({ domIndex: 0, x: 0, y: 0 });
    const b = el({ domIndex: 1, x: 0, y: 100 });
    expect(detectReadingOrderInversions([a, b])).toHaveLength(0);
  });

  it("does not flag separate columns (no horizontal overlap)", () => {
    // B is above A but in a different column → legitimate multi-column layout, not an inversion
    const a = el({ domIndex: 0, x: 0, y: 100, w: 100 });
    const b = el({ domIndex: 1, x: 200, y: 0, w: 100 });
    expect(detectReadingOrderInversions([a, b])).toHaveLength(0);
  });

  it("caps the number of findings", () => {
    const many: GeomEl[] = [];
    for (let i = 0; i < 20; i++) {
      // each later element sits above the previous in the same column
      many.push(el({ domIndex: i, selector: `e${i}`, x: 0, y: (20 - i) * 100, w: 100, h: 20 }));
    }
    expect(detectReadingOrderInversions(many).length).toBeLessThanOrEqual(5);
  });
});
