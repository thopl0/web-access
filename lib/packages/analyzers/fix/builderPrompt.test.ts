import { describe, it, expect } from "vitest";
import { buildBuilderPrompt, type BuilderPromptIssue } from "./builderPrompt";

/**
 * These tests exercise ONLY the deterministic TEMPLATE path: they run with no GLM_API_KEY (the
 * default in CI), so `aiConfigured()` is false and `buildBuilderPrompt` returns `source: "template"`
 * with a document assembled entirely without a model call. We therefore assert on exact, stable text.
 */

/** Build a minimal issue — only the fields the template reads matter; the rest get harmless defaults. */
function issue(over: Partial<BuilderPromptIssue> = {}): BuilderPromptIssue {
  return {
    ruleId: "image-alt",
    wcag: ["1.1.1"],
    impact: "critical",
    pageUrl: "https://example.com/home",
    selector: "img.hero",
    what: "The hero image has no description.",
    fix: "Add alt text describing the image.",
    ...over,
  };
}

describe("buildBuilderPrompt (template fallback)", () => {
  // Guard: these assertions only hold without an AI key. (CI runs with none.)
  if (process.env.GLM_API_KEY) {
    it.skip("skipped: GLM_API_KEY is set, so the AI path runs", () => {});
    return;
  }

  it("returns the deterministic template when GLM is unconfigured", async () => {
    const res = await buildBuilderPrompt([issue()], { platform: "wix", siteName: "Acme" });
    expect(res.source).toBe("template");
    expect(res.platform).toBe("wix");
    expect(res.issueCount).toBe(1);
    expect(res.prompt.length).toBeGreaterThan(0);
  });

  it("includes the site name", async () => {
    const res = await buildBuilderPrompt([issue()], { platform: "wix", siteName: "Acme Widgets" });
    expect(res.prompt).toContain("Acme Widgets");
  });

  it("lists the issues (what + fix), grouped by page", async () => {
    const res = await buildBuilderPrompt(
      [
        issue({ what: "The hero image has no description.", fix: "Add alt text." }),
        issue({
          ruleId: "link-name",
          selector: "a.cta",
          impact: "serious",
          what: "The call-to-action link has no readable text.",
          fix: "Give the link visible text.",
        }),
      ],
      { platform: "wordpress", siteName: "Acme" },
    );
    expect(res.issueCount).toBe(2);
    expect(res.prompt).toContain("/home"); // page heading is the path, not the origin
    expect(res.prompt).not.toContain("https://example.com");
    expect(res.prompt).toContain("The hero image has no description.");
    expect(res.prompt).toContain("Add alt text.");
    expect(res.prompt).toContain("The call-to-action link has no readable text.");
  });

  it("differs between an AI builder and a CMS platform", async () => {
    const issues = [issue()];
    const ai = await buildBuilderPrompt(issues, { platform: "lovable", siteName: "Acme" });
    const cms = await buildBuilderPrompt(issues, { platform: "wix", siteName: "Acme" });

    expect(ai.prompt).not.toBe(cms.prompt);
    // The AI-builder document opens as a paste-back prompt addressed to the builder...
    expect(ai.prompt).toContain("Lovable");
    expect(ai.prompt.toLowerCase()).toContain("fix the following accessibility issues");
    // ...while the CMS document opens as editor instructions naming the platform.
    expect(cms.prompt).toContain("Wix");
    expect(cms.prompt.toLowerCase()).toContain("editor");
  });

  it("never leaks raw selectors into the document", async () => {
    const res = await buildBuilderPrompt([issue({ selector: "div.x > img.hero:nth-child(2)" })], {
      platform: "lovable",
      siteName: "Acme",
    });
    expect(res.prompt).not.toContain("nth-child");
  });

  it("emits a friendly, valid document with zero issues", async () => {
    const res = await buildBuilderPrompt([], { platform: "webflow", siteName: "Acme" });
    expect(res.source).toBe("template");
    expect(res.issueCount).toBe(0);
    expect(res.prompt.trim().length).toBeGreaterThan(0);
  });

  it("falls back to template (not throw) for an unknown platform string", async () => {
    const res = await buildBuilderPrompt([issue()], { platform: "totally-unknown", siteName: "Acme" });
    expect(res.source).toBe("template");
    // Unknown platforms resolve to the CMS-style "other" instructions, which name the editor.
    expect(res.prompt.toLowerCase()).toContain("editor");
  });

  it("includes the corrected markup when an `after` is provided", async () => {
    const res = await buildBuilderPrompt(
      [issue({ after: '<img class="hero" alt="A red bicycle leaning on a wall">' })],
      { platform: "lovable", siteName: "Acme" },
    );
    expect(res.prompt).toContain('alt="A red bicycle leaning on a wall"');
  });
});
