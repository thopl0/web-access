import { describe, it, expect } from "vitest";
import { prefilterImagesForVision } from "./visionPrefilter";
import type { ImageCandidate } from "./altText";

/**
 * These tests exercise ONLY the deterministic NO-OP paths of the vision pre-filter — the branches
 * that return the input unchanged WITHOUT a model call: GLM unconfigured, or <=1 candidate. They make
 * no network request. The "<=1 candidate" cases short-circuit before `aiConfigured()` even matters,
 * so they hold with or without a key; the "many candidates, GLM off" case only holds when no key is
 * set, so it is guarded like builderPrompt.test.ts (CI runs with none).
 */

/** Build a minimal candidate — only the fields the pre-filter reads matter; rest get defaults. */
function candidate(over: Partial<ImageCandidate> = {}): ImageCandidate {
  return {
    selector: "img",
    src: "https://example.com/a.jpg",
    filename: "a.jpg",
    alt: "A red bicycle leaning on a brick wall",
    declaredDecorative: false,
    ariaHidden: false,
    inLink: false,
    linkText: "",
    caption: "",
    ariaLabel: "",
    width: 400,
    height: 300,
    ...over,
  };
}

describe("prefilterImagesForVision (no-op paths, no network)", () => {
  it("returns [] unchanged for an empty candidate list", async () => {
    const out = await prefilterImagesForVision([]);
    expect(out).toEqual([]);
  });

  it("returns the single candidate unchanged (nothing to save on a set of 1)", async () => {
    const one = [candidate({ selector: "#only" })];
    const out = await prefilterImagesForVision(one);
    expect(out).toEqual(one);
    expect(out).toHaveLength(1);
  });

  // Guard: with >1 candidate AND a GLM key, the live GLM path runs (network). Skip that here.
  if (process.env.GLM_API_KEY) {
    it.skip("skipped: GLM_API_KEY is set, so the live pre-filter path runs", () => {});
    return;
  }

  it("returns all candidates unchanged when GLM is unconfigured", async () => {
    const many = [
      candidate({ selector: "#a" }),
      candidate({ selector: "#b", declaredDecorative: true, alt: "" }),
      candidate({ selector: "#c", ariaHidden: true }),
    ];
    const out = await prefilterImagesForVision(many);
    expect(out).toEqual(many);
    expect(out).toHaveLength(3);
  });

  it("preserves order and identity when GLM is unconfigured", async () => {
    const many = [candidate({ selector: "#first" }), candidate({ selector: "#second" })];
    const out = await prefilterImagesForVision(many);
    expect(out[0]).toBe(many[0]);
    expect(out[1]).toBe(many[1]);
  });
});
