import { describe, it, expect } from "vitest";
import { SAFE_REMEDIATION_ATTRS, type Finding } from "@web-access/shared";
import { deterministicFix } from "./deterministic";

const SAFE = new Set<string>(SAFE_REMEDIATION_ATTRS);

/**
 * Build a minimal `Finding` for a fix test — we only ever read `ruleId` + `htmlSnippet`, so the
 * rest are filled with harmless defaults to satisfy the type.
 */
function finding(ruleId: string, htmlSnippet: string): Finding {
  return {
    ruleId,
    source: "axe",
    tier: 1,
    wcag: [],
    impact: null,
    selector: "x",
    htmlSnippet,
    message: "",
  };
}

describe("deterministicFix — html lang", () => {
  it("adds lang=\"en\" to a bare <html> tag, no review needed", () => {
    const fix = deterministicFix(finding("html-has-lang", "<html>"));
    expect(fix).not.toBeNull();
    expect(fix!.after).toContain('lang="en"');
    expect(fix!.needsReview).toBe(false);
  });

  it("preserves existing attributes when inserting lang", () => {
    const fix = deterministicFix(finding("html-has-lang", '<html class="dark">'));
    expect(fix!.after).toBe('<html lang="en" class="dark">');
  });

  it("returns null when a valid lang is already present (no-op)", () => {
    expect(deterministicFix(finding("html-has-lang", '<html lang="fr">'))).toBeNull();
  });

  it("does not match data-lang (word boundary)", () => {
    const fix = deterministicFix(finding("html-has-lang", '<html data-lang="x">'));
    expect(fix).not.toBeNull();
    expect(fix!.after).toContain('lang="en"');
  });

  it("html-lang-valid with an empty lang gets rewritten to en", () => {
    const fix = deterministicFix(finding("html-lang-valid", '<html lang="">'));
    expect(fix!.after).toBe('<html lang="en">');
    expect(fix!.needsReview).toBe(false);
  });

  it("html-lang-valid with a malformed-but-nonempty lang is left for a human", () => {
    expect(deterministicFix(finding("html-lang-valid", '<html lang="english">'))).toBeNull();
  });

  it("returns null if the snippet is not an <html> tag", () => {
    expect(deterministicFix(finding("html-has-lang", "<div></div>"))).toBeNull();
  });
});

describe("deterministicFix — image alt", () => {
  it("adds alt=\"\" to a role=presentation image", () => {
    const fix = deterministicFix(finding("image-alt", '<img role="presentation" src="x.png">'));
    expect(fix).not.toBeNull();
    expect(fix!.after).toContain('alt=""');
    expect(fix!.needsReview).toBe(false);
  });

  it("adds alt=\"\" to an image whose filename reads as a spacer", () => {
    const fix = deterministicFix(finding("image-alt", '<img src="/img/spacer.gif">'));
    expect(fix!.after).toContain('alt=""');
  });

  it("adds alt=\"\" to an icon image", () => {
    const fix = deterministicFix(finding("image-alt", '<img src="https://cdn/x/icon-arrow.svg">'));
    expect(fix!.after).toContain('alt=""');
  });

  it("returns null for a clearly-content image (no decorative signal)", () => {
    expect(deterministicFix(finding("image-alt", '<img src="team-photo.jpg">'))).toBeNull();
  });

  it("returns null when the image already has an alt attribute", () => {
    expect(deterministicFix(finding("image-alt", '<img src="spacer.gif" alt="hi">'))).toBeNull();
  });
});

describe("deterministicFix — labels / names (placeholder, needs review)", () => {
  it("adds a placeholder aria-label to an unlabelled input", () => {
    const fix = deterministicFix(finding("label", '<input type="text">'));
    expect(fix).not.toBeNull();
    expect(fix!.after).toContain("aria-label=");
    expect(fix!.needsReview).toBe(true);
    expect(fix!.note).toBeTruthy();
  });

  it("adds a placeholder aria-label to an unnamed select", () => {
    const fix = deterministicFix(finding("select-name", "<select></select>"));
    expect(fix!.after).toContain("aria-label=");
    expect(fix!.needsReview).toBe(true);
  });

  it("input-button-name on an unnamed button input", () => {
    const fix = deterministicFix(finding("input-button-name", '<input type="submit">'));
    expect(fix!.after).toContain("aria-label=");
    expect(fix!.needsReview).toBe(true);
  });

  it("returns null when the field already has an aria-label", () => {
    expect(deterministicFix(finding("label", '<input aria-label="Email">'))).toBeNull();
  });
});

describe("deterministicFix — empty links / buttons (placeholder, needs review)", () => {
  it("adds an aria-label describing the link to an empty <a>", () => {
    const fix = deterministicFix(finding("link-name", '<a href="/x"></a>'));
    expect(fix).not.toBeNull();
    expect(fix!.after).toContain("aria-label=");
    expect(fix!.note).toContain("link");
    expect(fix!.needsReview).toBe(true);
  });

  it("treats an icon-only link (img child, no text) as empty", () => {
    const fix = deterministicFix(finding("link-name", '<a href="/x"><img src="i.svg"></a>'));
    expect(fix!.after).toContain("aria-label=");
  });

  it("adds an aria-label describing the button to an empty <button>", () => {
    const fix = deterministicFix(finding("button-name", "<button></button>"));
    expect(fix!.after).toContain("aria-label=");
    expect(fix!.note).toContain("button");
  });

  it("returns null when the link has visible text already", () => {
    expect(deterministicFix(finding("link-name", '<a href="/x">View pricing</a>'))).toBeNull();
  });

  it("returns null when the link already has an aria-label", () => {
    expect(deterministicFix(finding("link-name", '<a href="/x" aria-label="Home"></a>'))).toBeNull();
  });
});

describe("deterministicFix — attributePatch (Phase C runtime remediation)", () => {
  it("emits a lang=en attribute patch for html-has-lang, no review", () => {
    const fix = deterministicFix(finding("html-has-lang", "<html>"));
    expect(fix!.attributePatch).toEqual([{ attr: "lang", value: "en" }]);
    expect(fix!.needsReview).toBe(false);
  });

  it("emits an empty-alt attribute patch for a decorative image", () => {
    const fix = deterministicFix(finding("image-alt", '<img role="presentation" src="x.png">'));
    expect(fix!.attributePatch).toEqual([{ attr: "alt", value: "" }]);
  });

  it("emits a placeholder aria-label patch but keeps needsReview=true (UI must edit it)", () => {
    const fix = deterministicFix(finding("label", '<input type="text">'));
    expect(fix!.needsReview).toBe(true);
    expect(fix!.attributePatch).toHaveLength(1);
    expect(fix!.attributePatch![0]!.attr).toBe("aria-label");
    expect(fix!.attributePatch![0]!.value).toMatch(/^TODO:/);
  });

  it("only ever uses attributes from the safe non-visual allowlist", () => {
    const cases: Finding[] = [
      finding("html-has-lang", "<html>"),
      finding("html-lang-valid", '<html lang="">'),
      finding("image-alt", '<img src="/img/spacer.gif">'),
      finding("label", '<input type="text">'),
      finding("select-name", "<select></select>"),
      finding("link-name", '<a href="/x"></a>'),
      finding("button-name", "<button></button>"),
    ];
    for (const f of cases) {
      const fix = deterministicFix(f);
      expect(fix).not.toBeNull();
      expect(fix!.attributePatch).toBeDefined();
      for (const patch of fix!.attributePatch!) {
        expect(SAFE.has(patch.attr)).toBe(true);
      }
    }
  });
});

describe("deterministicFix — non-mechanical rules decline", () => {
  it("returns null for color-contrast", () => {
    expect(deterministicFix(finding("color-contrast", "<p>hi</p>"))).toBeNull();
  });

  it("returns null for reading-order", () => {
    expect(deterministicFix(finding("reading-order", "<div>hi</div>"))).toBeNull();
  });

  it("returns null for document-title (a <head> concern, not element-level)", () => {
    expect(deterministicFix(finding("document-title", "<title></title>"))).toBeNull();
  });

  it("returns null for an empty snippet", () => {
    expect(deterministicFix(finding("html-has-lang", "   "))).toBeNull();
  });
});
