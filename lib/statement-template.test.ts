import { describe, it, expect } from "vitest";

import { buildStatementModel, renderStatementDocument } from "./statement-template";
import { buildChecklist, summarizeConformance } from "./wcag";
import type { StatementConfig } from "@web-access/shared";

const CONFIG: StatementConfig = { target: "2.1-AA" };
const AT = new Date("2026-06-18T00:00:00Z");

/** Build a model from raw issues the way the server loader does (report → wcag engine → model). */
function modelFrom(
  issues: { wcag: string[] }[],
  opts: { evaluated?: boolean; config?: StatementConfig; origin?: string | null; ownerEmail?: string | null } = {},
) {
  const evaluated = opts.evaluated ?? issues.length > 0;
  return buildStatementModel({
    siteName: "Acme",
    origin: "origin" in opts ? (opts.origin ?? null) : "https://acme.example",
    config: opts.config ?? CONFIG,
    conformance: summarizeConformance(issues, { evaluated }),
    checklist: buildChecklist(issues, { evaluated }),
    ownerEmail: opts.ownerEmail ?? null,
    generatedAt: AT,
    lastScannedAt: AT,
  });
}

describe("buildStatementModel", () => {
  it("reports no-data when nothing has been scanned", () => {
    const m = modelFrom([], { evaluated: false });
    expect(m.status).toBe("no-data");
    expect(m.statusLabel).toMatch(/cannot/i);
    expect(m.failing).toEqual([]);
  });

  it("lists failing criteria when issues exist", () => {
    const m = modelFrom([{ wcag: ["1.1.1"] }, { wcag: ["1.4.3"] }]);
    expect(m.status).toBe("partial-issues");
    expect(m.statusLabel).toBe("Partially conformant");
    expect(m.failing.map((f) => f.sc).sort()).toEqual(["1.1.1", "1.4.3"]);
  });

  it("never claims full conformance on a clean automated scan", () => {
    // Evaluated, but no failing criteria — must still be "partial", never "full".
    const m = modelFrom([], { evaluated: true });
    expect(m.status).toBe("partial-clean");
    expect(m.statusLabel).toBe("Partially conformant");
    // Honesty figures must be populated so the manual-review caveat is shown.
    expect(m.manualReviewCount).toBeGreaterThan(0);
    expect(m.totalCriteria).toBe(m.checkedAutomatically + m.manualReviewCount);
  });

  it("prefers config entity/contact, falls back to site name and owner email", () => {
    const withConfig = modelFrom([{ wcag: ["1.1.1"] }], {
      config: { target: "2.2-AA", entityName: "Acme Inc", contactEmail: "a11y@acme.example" },
    });
    expect(withConfig.entityName).toBe("Acme Inc");
    expect(withConfig.contactEmail).toBe("a11y@acme.example");
    expect(withConfig.targetLabel).toBe("WCAG 2.2 level AA");

    const fallback = modelFrom([{ wcag: ["1.1.1"] }], { ownerEmail: "owner@acme.example" });
    expect(fallback.entityName).toBe("Acme"); // site name
    expect(fallback.contactEmail).toBe("owner@acme.example"); // owner email fallback
  });

  it("derives bare host from origin", () => {
    expect(modelFrom([{ wcag: ["1.1.1"] }], { origin: "https://shop.acme.example/path" }).siteHost).toBe(
      "shop.acme.example",
    );
    expect(modelFrom([{ wcag: ["1.1.1"] }], { origin: null }).siteHost).toBeNull();
  });
});

describe("renderStatementDocument", () => {
  it("escapes user-supplied content to prevent HTML injection", () => {
    const m = modelFrom([{ wcag: ["1.1.1"] }], {
      config: { target: "2.1-AA", entityName: '<script>alert(1)</script>' },
    });
    const html = renderStatementDocument(m);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("produces a complete, self-contained document with the failing criteria", () => {
    const m = modelFrom([{ wcag: ["1.4.3"] }]);
    const html = renderStatementDocument(m);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("Accessibility statement for Acme");
    expect(html).toContain("Contrast (Minimum)"); // 1.4.3 title
    expect(html).toContain("partially conformant");
  });
});
