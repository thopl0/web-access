import { describe, it, expect } from "vitest";

import { buildVpatModel, renderVpatDocument } from "./vpat-template";
import { buildChecklist, summarizeConformance } from "./wcag";
import type { StatementConfig } from "@web-access/shared";

const CONFIG: StatementConfig = { target: "2.1-AA" };
const AT = new Date("2026-06-18T00:00:00Z");

/** Build a model from raw issues the way the server loader does (report → wcag engine → model). */
function modelFrom(issues: { wcag: string[] }[], opts: { evaluated?: boolean } = {}) {
  const evaluated = opts.evaluated ?? issues.length > 0;
  return buildVpatModel({
    siteName: "Acme",
    origin: "https://acme.example",
    config: CONFIG,
    conformance: summarizeConformance(issues, { evaluated }),
    checklist: buildChecklist(issues, { evaluated }),
    generatedAt: AT,
    lastScannedAt: AT,
  });
}

function rowFor(m: ReturnType<typeof modelFrom>, sc: string) {
  const row = m.rows.find((r) => r.sc === sc);
  if (!row) throw new Error(`no row for ${sc}`);
  return row;
}

describe("buildVpatModel", () => {
  it("maps a passing automatable criterion to Supports", () => {
    // 1.4.3 is automatable; a clean evaluated scan passes it.
    const m = modelFrom([], { evaluated: true });
    expect(rowFor(m, "1.4.3").conformance).toBe("Supports");
    expect(rowFor(m, "1.4.3").remarks).toMatch(/automated testing/i);
  });

  it("maps a failing criterion to Does Not Support", () => {
    const m = modelFrom([{ wcag: ["1.4.3"] }]);
    expect(rowFor(m, "1.4.3").conformance).toBe("Does Not Support");
    expect(rowFor(m, "1.4.3").remarks).toMatch(/detected failures/i);
  });

  it("maps a manual-only not-tested criterion to Not Evaluated with a manual-review remark", () => {
    // 1.2.1 is manual-only — never claimed as Supports off a clean scan.
    const m = modelFrom([], { evaluated: true });
    const row = rowFor(m, "1.2.1");
    expect(row.conformance).toBe("Not Evaluated");
    expect(row.remarks).toMatch(/manual review/i);
  });

  it("marks every criterion Not Evaluated when nothing has been scanned", () => {
    const m = modelFrom([], { evaluated: false });
    expect(m.evaluated).toBe(false);
    expect(m.rows.every((r) => r.conformance === "Not Evaluated")).toBe(true);
    expect(m.rows.every((r) => /not yet scanned/i.test(r.remarks))).toBe(true);
  });

  it("splits rows into Level A and Level AA tables", () => {
    const m = modelFrom([], { evaluated: true });
    expect(m.levelA.length).toBeGreaterThan(0);
    expect(m.levelAA.length).toBeGreaterThan(0);
    expect(m.levelA.every((r) => r.level === "A")).toBe(true);
    expect(m.levelAA.every((r) => r.level === "AA")).toBe(true);
    expect(m.levelA.length + m.levelAA.length).toBe(m.rows.length);
  });
});

describe("renderVpatDocument", () => {
  it("always carries the automated-only disclaimer", () => {
    const evaluated = renderVpatDocument(modelFrom([{ wcag: ["1.1.1"] }]));
    expect(evaluated).toMatch(/automated testing only/i);
    expect(evaluated).toMatch(/not a guarantee of full conformance/i);

    // Disclaimer is present even with no scan data.
    const noData = renderVpatDocument(modelFrom([], { evaluated: false }));
    expect(noData).toMatch(/automated testing only/i);
    expect(noData).toMatch(/not a guarantee of full conformance/i);
  });

  it("renders the standard VPAT tables", () => {
    const html = renderVpatDocument(modelFrom([], { evaluated: true }));
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("Table 1: Success Criteria, Level A");
    expect(html).toContain("Table 2: Success Criteria, Level AA");
    expect(html).toContain("Conformance Level");
  });

  it("escapes the entity name to prevent HTML injection", () => {
    const m = buildVpatModel({
      siteName: '<img src=x onerror=alert(1)>',
      origin: null,
      config: CONFIG,
      conformance: summarizeConformance([{ wcag: ["1.1.1"] }], { evaluated: true }),
      checklist: buildChecklist([{ wcag: ["1.1.1"] }], { evaluated: true }),
      generatedAt: AT,
      lastScannedAt: AT,
    });
    const html = renderVpatDocument(m);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });
});
