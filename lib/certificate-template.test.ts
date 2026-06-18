import { describe, it, expect } from "vitest";

import { buildCertificateModel, renderCertificateDocument } from "./certificate-template";
import { buildChecklist, summarizeConformance } from "./wcag";
import type { StatementConfig } from "@web-access/shared";

const CONFIG: StatementConfig = { target: "2.1-AA" };
const AT = new Date("2026-06-18T00:00:00Z");

function modelFrom(issues: { wcag: string[] }[], opts: { evaluated?: boolean; pageCount?: number } = {}) {
  const evaluated = opts.evaluated ?? issues.length > 0;
  return buildCertificateModel({
    siteName: "Acme",
    origin: "https://acme.example",
    config: CONFIG,
    conformance: summarizeConformance(issues, { evaluated }),
    checklist: buildChecklist(issues, { evaluated }),
    pageCount: opts.pageCount ?? 3,
    generatedAt: AT,
    lastScannedAt: AT,
  });
}

describe("buildCertificateModel", () => {
  it("is not evaluated with no scan data", () => {
    const m = modelFrom([], { evaluated: false });
    expect(m.evaluated).toBe(false);
    expect(m.automatedScore).toBe(0);
  });

  it("marks levels clean only when there are no failures", () => {
    const clean = modelFrom([], { evaluated: true });
    expect(clean.aClean).toBe(true);
    expect(clean.aaClean).toBe(true);
    expect(clean.automatedScore).toBe(100);

    const dirty = modelFrom([{ wcag: ["1.4.3"] }]); // 1.4.3 is Level AA
    expect(dirty.aaClean).toBe(false);
    expect(dirty.failingAA).toBe(1);
    expect(dirty.automatedScore).toBeLessThan(100);
  });

  it("score is passed / automatically-checked, not over all criteria", () => {
    const m = modelFrom([], { evaluated: true });
    expect(m.totalCriteria).toBeGreaterThan(m.checkedAutomatically); // manual criteria exist
    expect(m.passed).toBe(m.checkedAutomatically); // clean scan: all automatable passed
  });
});

describe("renderCertificateDocument", () => {
  it("always carries the automated-only disclaimer", () => {
    const html = renderCertificateDocument(modelFrom([{ wcag: ["1.1.1"] }]));
    expect(html).toMatch(/not a guarantee of full conformance/i);
    expect(html).toMatch(/automated testing only/i);
  });

  it("escapes entity name", () => {
    const m = buildCertificateModel({
      siteName: '<img src=x onerror=alert(1)>',
      origin: null,
      config: CONFIG,
      conformance: summarizeConformance([{ wcag: ["1.1.1"] }], { evaluated: true }),
      checklist: buildChecklist([{ wcag: ["1.1.1"] }], { evaluated: true }),
      pageCount: 1,
      generatedAt: AT,
      lastScannedAt: AT,
    });
    const html = renderCertificateDocument(m);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });
});
