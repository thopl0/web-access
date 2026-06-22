import { describe, it, expect } from "vitest";
import { buildManifest, type RemediationRow } from "./remediation-manifest";

function row(over: Partial<RemediationRow>): RemediationRow {
  return { selector: ".x", kind: "attr", attr: "aria-label", value: "v", enabled: true, ...over };
}

describe("buildManifest — safe-attr filtering & grouping", () => {
  it("groups multiple patches under one selector", () => {
    const m = buildManifest([
      row({ selector: "img.logo", attr: "alt", value: "Acme" }),
      row({ selector: "img.logo", attr: "role", value: "img" }),
    ]);
    expect(m.entries).toEqual([
      {
        selector: "img.logo",
        patches: [{ attr: "alt", value: "Acme" }, { attr: "role", value: "img" }],
        css: [],
      },
    ]);
  });

  it("drops disabled rows", () => {
    const m = buildManifest([row({ enabled: false })]);
    expect(m.entries).toEqual([]);
  });

  it("drops rows whose attr is NOT in the safe allowlist (defensive gate)", () => {
    const m = buildManifest([
      row({ selector: "a", attr: "href", value: "https://evil.example" }), // not safe → dropped
      row({ selector: "a", attr: "style", value: "display:none" }), // not safe → dropped
      row({ selector: "a", attr: "aria-label", value: "Home" }), // safe → kept
    ]);
    expect(m.entries).toEqual([{ selector: "a", patches: [{ attr: "aria-label", value: "Home" }], css: [] }]);
  });

  it("keeps every safe attribute", () => {
    const safe = ["alt", "aria-label", "aria-labelledby", "aria-describedby", "lang", "role", "title", "aria-hidden"];
    const m = buildManifest(safe.map((attr) => row({ selector: ".el", attr, value: "x" })));
    expect(m.entries[0]!.patches.map((p) => p.attr).sort()).toEqual([...safe].sort());
  });

  it("returns an empty manifest for no rows", () => {
    expect(buildManifest([])).toEqual({ entries: [] });
  });

  it("only serves CSS patches when includeCss is true, and re-checks the CSS allowlist", () => {
    const rows = [
      row({ selector: "a.btn", kind: "css", attr: "min-height", value: "24px" }), // safe css
      row({ selector: "a.btn", kind: "css", attr: "position", value: "fixed" }), // not safe → dropped
      row({ selector: "a.btn", attr: "aria-label", value: "Go" }), // attr always served
    ];
    // CSS off: only the attribute patch comes through.
    expect(buildManifest(rows, false).entries).toEqual([
      { selector: "a.btn", patches: [{ attr: "aria-label", value: "Go" }], css: [] },
    ]);
    // CSS on: the safe css prop is included, the non-safe one stays dropped.
    expect(buildManifest(rows, true).entries).toEqual([
      {
        selector: "a.btn",
        patches: [{ attr: "aria-label", value: "Go" }],
        css: [{ prop: "min-height", value: "24px" }],
      },
    ]);
  });
});
