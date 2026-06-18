import { describe, it, expect } from "vitest";
import { buildManifest, type RemediationRow } from "./remediation-manifest";

function row(over: Partial<RemediationRow>): RemediationRow {
  return { selector: ".x", attr: "aria-label", value: "v", enabled: true, ...over };
}

describe("buildManifest — safe-attr filtering & grouping", () => {
  it("groups multiple patches under one selector", () => {
    const m = buildManifest([
      row({ selector: "img.logo", attr: "alt", value: "Acme" }),
      row({ selector: "img.logo", attr: "role", value: "img" }),
    ]);
    expect(m.entries).toEqual([
      { selector: "img.logo", patches: [{ attr: "alt", value: "Acme" }, { attr: "role", value: "img" }] },
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
    expect(m.entries).toEqual([{ selector: "a", patches: [{ attr: "aria-label", value: "Home" }] }]);
  });

  it("keeps every safe attribute", () => {
    const safe = ["alt", "aria-label", "aria-labelledby", "aria-describedby", "lang", "role", "title", "aria-hidden"];
    const m = buildManifest(safe.map((attr) => row({ selector: ".el", attr, value: "x" })));
    expect(m.entries[0]!.patches.map((p) => p.attr).sort()).toEqual([...safe].sort());
  });

  it("returns an empty manifest for no rows", () => {
    expect(buildManifest([])).toEqual({ entries: [] });
  });
});
