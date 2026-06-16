import { describe, it, expect } from "vitest";
import type { Result as AxeResult } from "axe-core";
import { extractWcag, mapAxeViolations } from "./axe";

describe("extractWcag", () => {
  it("parses single-digit SC tags", () => {
    expect(extractWcag(["wcag111", "wcag2aa", "cat.text-alternatives"])).toEqual(["1.1.1"]);
  });

  it("parses two-digit final segments and dedups", () => {
    expect(extractWcag(["wcag1412", "wcag143", "wcag143"])).toEqual(["1.4.12", "1.4.3"]);
  });

  it("ignores non-SC tags (levels, best-practice, section508)", () => {
    expect(extractWcag(["best-practice", "wcag2a", "section508"])).toEqual([]);
  });
});

describe("mapAxeViolations", () => {
  const violations = [
    {
      id: "image-alt",
      impact: "critical",
      help: "Images must have alternate text",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.10/image-alt",
      tags: ["wcag2a", "wcag111"],
      nodes: [
        { html: "<img src='a.png'>", target: ["img"], impact: "critical" },
        { html: "<img src='b.png'>", target: [["#shadow-host", "img"]] },
      ],
    },
  ] as unknown as AxeResult[];

  it("emits one finding per node, normalized to the Finding schema", () => {
    const findings = mapAxeViolations(violations);
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({
      ruleId: "image-alt",
      source: "axe",
      tier: 1,
      wcag: ["1.1.1"],
      impact: "critical",
      selector: "img",
      message: "Images must have alternate text",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.10/image-alt",
    });
  });

  it("flattens nested (shadow DOM) target selectors", () => {
    const findings = mapAxeViolations(violations);
    expect(findings[1]?.selector).toBe("#shadow-host img");
  });

  it("falls back to the violation impact when a node has none", () => {
    const findings = mapAxeViolations(violations);
    expect(findings[1]?.impact).toBe("critical");
  });

  it("truncates long HTML snippets", () => {
    const long = [
      {
        id: "x",
        impact: "minor",
        help: "h",
        helpUrl: "https://example.com",
        tags: [],
        nodes: [{ html: "<div>".concat("a".repeat(500), "</div>"), target: ["div"] }],
      },
    ] as unknown as AxeResult[];
    expect(mapAxeViolations(long)[0]!.htmlSnippet.length).toBeLessThanOrEqual(300);
  });
});
