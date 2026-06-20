import { describe, it, expect } from "vitest";
import type { Finding } from "@web-access/shared";
import type { RiskTier } from "../../../legalRisk";
import { generateReportSummary } from "./reportSummary";

/**
 * These tests exercise ONLY the deterministic path: they run with no GLM_API_KEY (the default in CI),
 * so `aiConfigured()` is false and `generateReportSummary` returns `source: "deterministic"` with a
 * summary + triage assembled entirely without a model call. We assert on the stable contract rather
 * than exact prose so the AI rewrite can evolve.
 *
 * We deliberately do NOT hard-code which rule maps to which legal-risk tier — that mapping is owned by
 * `lib/legalRisk.ts`. Instead we feed a spread of common rules and assert the structural guarantees:
 * the triage is ordered highest-risk-first, names the site + count, etc.
 */

/** Tier rank for "is this list sorted worst-first" (lower = worse). */
const TIER_RANK: Record<RiskTier, number> = { high: 0, medium: 1, low: 2 };

/** Build a minimal Finding — only the fields the ranker/summary read matter. */
function finding(over: Partial<Finding> = {}): Finding {
  return {
    ruleId: "image-alt",
    source: "axe",
    tier: 1,
    wcag: ["1.1.1"],
    impact: "critical",
    selector: "img.hero",
    htmlSnippet: "<img class=\"hero\">",
    message: "Images must have alternate text",
    ...over,
  };
}

/** A representative spread of rules so several legal-risk tiers are exercised. */
function mixedFindings(): Finding[] {
  return [
    finding({ ruleId: "image-alt", wcag: ["1.1.1"], impact: "critical", selector: "img.a" }),
    finding({ ruleId: "label", wcag: ["1.3.1", "4.1.2"], impact: "critical", selector: "input.b" }),
    finding({ ruleId: "color-contrast", wcag: ["1.4.3"], impact: "serious", selector: "p.c" }),
    finding({ ruleId: "link-name", wcag: ["2.4.4", "4.1.2"], impact: "serious", selector: "a.d" }),
    finding({ ruleId: "heading-order", wcag: ["1.3.1"], impact: "moderate", selector: "h3.e" }),
    finding({ ruleId: "region", wcag: [], impact: "minor", selector: "div.f" }),
  ];
}

describe("generateReportSummary (deterministic path)", () => {
  // Guard: these assertions only hold without an AI key. (CI runs with none.)
  if (process.env.GLM_API_KEY) {
    it.skip("skipped: GLM_API_KEY is set, so the AI path runs", () => {});
    return;
  }

  it("returns a deterministic summary that names the site and the issue count", async () => {
    const findings = mixedFindings();
    const res = await generateReportSummary(findings, { siteName: "Acme Widgets" });

    expect(res.source).toBe("deterministic");
    expect(res.plainSummary.length).toBeGreaterThan(0);
    expect(res.plainSummary).toContain("Acme Widgets");
    // The total count appears verbatim in the summary.
    expect(res.plainSummary).toContain(String(findings.length));
  });

  it("orders the triage list highest legal-risk first", async () => {
    const res = await generateReportSummary(mixedFindings(), { siteName: "Acme" });

    expect(res.triage.length).toBeGreaterThan(0);
    // Triage is only high/medium-risk items, never low.
    for (const t of res.triage) {
      expect(t.tier === "high" || t.tier === "medium").toBe(true);
      expect(t.ruleId.length).toBeGreaterThan(0);
      expect(t.why.length).toBeGreaterThan(0);
    }
    // Non-increasing tier severity (worst first), as guaranteed by rankByLegalRisk.
    for (let i = 1; i < res.triage.length; i++) {
      expect(TIER_RANK[res.triage[i]!.tier]).toBeGreaterThanOrEqual(
        TIER_RANK[res.triage[i - 1]!.tier],
      );
    }
  });

  it("carries the offending selector onto each triage item", async () => {
    const res = await generateReportSummary(
      [finding({ ruleId: "image-alt", selector: "img.logo", impact: "critical" })],
      { siteName: "Acme" },
    );
    // image-alt is a high-exposure rule, so it should make the triage list with its selector.
    const item = res.triage.find((t) => t.ruleId === "image-alt");
    expect(item).toBeDefined();
    expect(item!.selector).toBe("img.logo");
  });

  it("yields a valid 'no issues' summary for empty findings", async () => {
    const res = await generateReportSummary([], { siteName: "Acme" });

    expect(res.source).toBe("deterministic");
    expect(res.triage).toEqual([]);
    expect(res.plainSummary.length).toBeGreaterThan(0);
    expect(res.plainSummary).toContain("Acme");
  });

  it("never throws and never returns null even with odd input", async () => {
    const res = await generateReportSummary(mixedFindings(), { siteName: "   " });
    expect(res).not.toBeNull();
    // Blank site name falls back to a friendly default.
    expect(res.plainSummary).toContain("your site");
  });
});
