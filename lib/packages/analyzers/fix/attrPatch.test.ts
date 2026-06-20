import { describe, it, expect } from "vitest";
import { SAFE_REMEDIATION_ATTRS } from "@web-access/shared";
import { extractSafeAttrPatch } from "./attrPatch";

const SAFE = new Set<string>(SAFE_REMEDIATION_ATTRS);

/** Assert every emitted patch targets a safe attr (a property the whole pipeline depends on). */
function assertAllSafe(patches: ReturnType<typeof extractSafeAttrPatch>) {
  expect(patches).toBeDefined();
  for (const p of patches!) expect(SAFE.has(p.attr)).toBe(true);
}

describe("extractSafeAttrPatch — positives (pure safe-attr sets)", () => {
  it("alt added on an <img> yields a single alt patch", () => {
    const patch = extractSafeAttrPatch(
      '<img src="/dog.jpg">',
      '<img src="/dog.jpg" alt="A dog catching a frisbee">',
    );
    expect(patch).toEqual([{ attr: "alt", value: "A dog catching a frisbee" }]);
    assertAllSafe(patch);
  });

  it("alt changed (filename → meaningful) yields the new alt value", () => {
    const patch = extractSafeAttrPatch(
      '<img src="/p.jpg" alt="IMG_2031.jpg">',
      '<img src="/p.jpg" alt="A red sports car">',
    );
    expect(patch).toEqual([{ attr: "alt", value: "A red sports car" }]);
  });

  it("aria-label added on a link yields a single aria-label patch", () => {
    const patch = extractSafeAttrPatch(
      '<a href="/pricing">Read more</a>',
      '<a href="/pricing" aria-label="Read more about our pricing">Read more</a>',
    );
    expect(patch).toEqual([{ attr: "aria-label", value: "Read more about our pricing" }]);
  });

  it('decorative alt="" is a valid patch (empty allowed only for alt)', () => {
    const patch = extractSafeAttrPatch('<img src="/spacer.gif">', '<img src="/spacer.gif" alt="">');
    expect(patch).toEqual([{ attr: "alt", value: "" }]);
  });

  it("role added yields a single role patch", () => {
    const patch = extractSafeAttrPatch(
      '<img src="/divider.png" alt="">',
      '<img src="/divider.png" alt="" role="presentation">',
    );
    expect(patch).toEqual([{ attr: "role", value: "presentation" }]);
  });

  it("decodes HTML entities in the emitted value", () => {
    const patch = extractSafeAttrPatch(
      '<a href="/s">x</a>',
      '<a href="/s" aria-label="Tom &amp; Jerry">x</a>',
    );
    expect(patch).toEqual([{ attr: "aria-label", value: "Tom & Jerry" }]);
  });

  it("ignores quote-style differences on unchanged attrs", () => {
    const patch = extractSafeAttrPatch(
      "<img src='/d.jpg'>",
      '<img src="/d.jpg" alt="A dog">',
    );
    expect(patch).toEqual([{ attr: "alt", value: "A dog" }]);
  });

  // An apostrophe inside a double-quoted value (and vice-versa) is common, legitimate alt text and
  // must NOT trip the truncation guard (which only counts the value's OWN quote char).
  it("alt with an apostrophe inside a double-quoted value is still a patch", () => {
    const patch = extractSafeAttrPatch('<img src="/x">', `<img src="/x" alt="Tom's cat">`);
    expect(patch).toEqual([{ attr: "alt", value: "Tom's cat" }]);
  });

  it("alt with a double-quote inside a single-quoted value is still a patch", () => {
    const patch = extractSafeAttrPatch('<img src="/x">', `<img src="/x" alt='Say "hi"'>`);
    expect(patch).toEqual([{ attr: "alt", value: 'Say "hi"' }]);
  });

  it("aria-hidden=\"true\" (safe attr, concrete value) yields a patch", () => {
    const patch = extractSafeAttrPatch("<span>x</span>", '<span aria-hidden="true">x</span>');
    expect(patch).toEqual([{ attr: "aria-hidden", value: "true" }]);
  });

  it("title (safe per allowlist) added on <abbr> yields a patch", () => {
    const patch = extractSafeAttrPatch(
      "<abbr>WCAG</abbr>",
      '<abbr title="Web Content Accessibility Guidelines">WCAG</abbr>',
    );
    expect(patch).toEqual([{ attr: "title", value: "Web Content Accessibility Guidelines" }]);
  });

  it("lang added on <html> yields a patch", () => {
    const patch = extractSafeAttrPatch("<html>", '<html lang="en">');
    expect(patch).toEqual([{ attr: "lang", value: "en" }]);
  });
});

describe("extractSafeAttrPatch — negatives (return undefined)", () => {
  it("visible inner-text change (heading rewrite) is not runtime-eligible", () => {
    expect(
      extractSafeAttrPatch("<h2>Stuff</h2>", "<h2>Our pricing plans</h2>"),
    ).toBeUndefined();
  });

  it("a link's visible label change is not runtime-eligible", () => {
    expect(
      extractSafeAttrPatch('<a href="/p">Click here</a>', '<a href="/p">See our pricing</a>'),
    ).toBeUndefined();
  });

  it("href change disqualifies (non-safe attr)", () => {
    expect(
      extractSafeAttrPatch('<a href="/old">x</a>', '<a href="/new">x</a>'),
    ).toBeUndefined();
  });

  it("src change disqualifies (non-safe attr)", () => {
    expect(
      extractSafeAttrPatch('<img src="/a.jpg" alt="x">', '<img src="/b.jpg" alt="x">'),
    ).toBeUndefined();
  });

  it("class change disqualifies (non-safe attr)", () => {
    expect(
      extractSafeAttrPatch('<img src="/a.jpg" class="sm">', '<img src="/a.jpg" class="lg" alt="A cat">'),
    ).toBeUndefined();
  });

  it("style change disqualifies (non-safe attr)", () => {
    expect(
      extractSafeAttrPatch('<img src="/a.jpg">', '<img src="/a.jpg" style="display:none" alt="x">'),
    ).toBeUndefined();
  });

  it("id change disqualifies (non-safe attr)", () => {
    expect(
      extractSafeAttrPatch('<img src="/a.jpg" id="one" alt="x">', '<img src="/a.jpg" id="two" alt="x">'),
    ).toBeUndefined();
  });

  it("tag-name change disqualifies", () => {
    expect(
      extractSafeAttrPatch('<b>x</b>', '<strong aria-label="x">x</strong>'),
    ).toBeUndefined();
  });

  it("removing a safe attr disqualifies (not an approvable value)", () => {
    expect(
      extractSafeAttrPatch('<img src="/a.jpg" alt="old">', '<img src="/a.jpg">'),
    ).toBeUndefined();
  });

  it("a placeholder (TODO) value disqualifies", () => {
    expect(
      extractSafeAttrPatch('<img src="/a.jpg">', '<img src="/a.jpg" alt="TODO: describe">'),
    ).toBeUndefined();
  });

  it("a non-alt empty value disqualifies", () => {
    expect(
      extractSafeAttrPatch('<a href="/s">x</a>', '<a href="/s" aria-label="">x</a>'),
    ).toBeUndefined();
  });

  it("pure attribute REORDER with identical values is not a change", () => {
    expect(
      extractSafeAttrPatch('<img alt="A dog" src="/d.jpg">', '<img src="/d.jpg" alt="A dog">'),
    ).toBeUndefined();
  });

  it("mixed change (safe attr + visible text together) disqualifies", () => {
    expect(
      extractSafeAttrPatch('<a href="/p">Click here</a>', '<a href="/p" aria-label="Pricing">See pricing</a>'),
    ).toBeUndefined();
  });

  it("unparseable snippets return undefined, never throw", () => {
    expect(extractSafeAttrPatch("not html", "<img alt='x'>")).toBeUndefined();
    expect(extractSafeAttrPatch("<img alt='x'>", "")).toBeUndefined();
  });

  // --- attacker probes: a `>` inside a quoted attribute value truncates the opening-tag regex.
  // The element really extends past what we parsed, so our attr/rest view is untrustworthy (a
  // non-safe attr could be hiding in the unparsed tail). We must bail to undefined in EVERY case.
  it("a `>` inside the new safe value (alt=\"a > b\") disqualifies (tag truncated)", () => {
    expect(
      extractSafeAttrPatch('<img src="/a.jpg">', '<img src="/a.jpg" alt="a > b">'),
    ).toBeUndefined();
  });

  it("a `>` inside a non-safe href hides its change behind an added safe attr → disqualified", () => {
    // Without the truncation guard the differing href is hidden past the truncation point and only
    // the added aria-label would surface — a misleading 'safe' patch for a fix that ALSO changed href.
    expect(
      extractSafeAttrPatch('<a href="/a?x=1>2">t</a>', '<a href="/a?DIFFERENT>2" aria-label="L">t</a>'),
    ).toBeUndefined();
  });

  it("a `>` inside an existing class value disqualifies even when only a safe attr is added", () => {
    expect(
      extractSafeAttrPatch('<img class="a>b" src="/x">', '<img class="a>b" src="/x" alt="cat">'),
    ).toBeUndefined();
  });

  it("a `>` inside a single-quoted value disqualifies", () => {
    expect(
      extractSafeAttrPatch("<img src='/x'>", "<img alt='a > b' src='/x'>"),
    ).toBeUndefined();
  });

  // --- whitespace-only safe values are content-free, misleading labels. The extractor must be no
  // looser than the approval action's `value.trim() === ""` gate (alt stays exempt: alt="" = decorative).
  it('a whitespace-only aria-label ("   ") disqualifies (content-free)', () => {
    expect(
      extractSafeAttrPatch('<a href="/p">x</a>', '<a href="/p" aria-label="   ">x</a>'),
    ).toBeUndefined();
  });

  it("a tab-only aria-label disqualifies (content-free)", () => {
    expect(
      extractSafeAttrPatch('<a href="/p">x</a>', '<a href="/p" aria-label="\t">x</a>'),
    ).toBeUndefined();
  });

  // --- a boolean (valueless) safe attr has no concrete value to setAttribute live.
  it("a bare boolean aria-hidden (no value) disqualifies — nothing concrete to apply", () => {
    expect(
      extractSafeAttrPatch("<span>x</span>", "<span aria-hidden>x</span>"),
    ).toBeUndefined();
  });

  // --- name-collision: an attr whose NAME contains a safe attr name is NOT itself safe.
  it("data-alt (name contains 'alt' but isn't the safe attr) disqualifies", () => {
    expect(
      extractSafeAttrPatch('<img src="/x" data-alt="old">', '<img src="/x" data-alt="new">'),
    ).toBeUndefined();
  });

  // --- entity-vs-raw values that are actually equal are NOT a change → no patch.
  it("an entity-encoded value equal to the existing raw value is not a change", () => {
    expect(
      extractSafeAttrPatch(
        '<a href="/p" aria-label="Tom &amp; Jerry">x</a>',
        '<a href="/p" aria-label="Tom & Jerry">x</a>',
      ),
    ).toBeUndefined();
  });

  // --- a leading HTML comment means the snippet doesn't START with the element → no clean parse.
  it("a leading HTML comment before the element disqualifies (not a leading opening tag)", () => {
    expect(
      extractSafeAttrPatch('<img src="/a.jpg">', '<!-- note --><img src="/a.jpg" alt="cat">'),
    ).toBeUndefined();
  });

  // --- a trailing second element (multi-element after) changes `rest` → disqualified.
  it("an extra trailing element in the after snippet disqualifies (rest differs)", () => {
    expect(
      extractSafeAttrPatch('<img src="/a.jpg">', '<img src="/a.jpg" alt="cat"><p>hi</p>'),
    ).toBeUndefined();
  });

  // --- a safe attr added on an INNER element (wrapper unchanged) lives in `rest`, not the tag → no patch.
  it("a safe attr added on a nested element (outer tag unchanged) disqualifies (rest differs)", () => {
    expect(
      extractSafeAttrPatch(
        "<div><img src=\"/a.jpg\"></div>",
        '<div><img src="/a.jpg" alt="cat"></div>',
      ),
    ).toBeUndefined();
  });

  // --- an unclosed/malformed after tag must fail to parse (never throw, never patch).
  it("an unclosed after tag disqualifies (no opening-tag match)", () => {
    expect(
      extractSafeAttrPatch('<img src="/a.jpg">', '<img src="/a.jpg" alt="cat"'),
    ).toBeUndefined();
  });

  // --- id-reference safe attrs point at element ids the AI never saw; an invented reference would be
  //     inert, so they stay markup-only even though they're in the allowlist.
  it("aria-labelledby (an AI-invented id reference) disqualifies even though it's a safe attr", () => {
    expect(
      extractSafeAttrPatch("<button></button>", '<button aria-labelledby="lbl-7"></button>'),
    ).toBeUndefined();
  });
  it("aria-describedby (an AI-invented id reference) disqualifies", () => {
    expect(
      extractSafeAttrPatch('<input type="text">', '<input type="text" aria-describedby="hint-2">'),
    ).toBeUndefined();
  });
});
