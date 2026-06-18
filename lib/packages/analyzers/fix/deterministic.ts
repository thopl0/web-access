/**
 * Deterministic (mechanical) code fixes — the half of the "fix" engine that needs no model.
 *
 * Given a single finding (its `ruleId` + the redacted `htmlSnippet` of the offending element, see
 * shared `Finding`), produce a templated before→after transform whenever the corrected markup is
 * UNAMBIGUOUS — e.g. an `<html>` tag missing `lang` gets `lang="en"`. There's no DOM and no network
 * here: we only ever see the short single-element snippet, so every transform is regex-driven and
 * deliberately CONSERVATIVE. When we can't be confident the mechanical result is correct, we return
 * `null` and leave the finding for the AI fixer (which judges wording it can't mechanically know,
 * like real alt text or a real field label — see `ai/enrich.ts` / `ai/altText.ts`).
 *
 * Two flavours of deterministic fix, distinguished by `needsReview` (mirrors shared `FixSuggestion`):
 *   - safe defaults    (`needsReview: false`) — `lang="en"`, `alt=""` on a clearly-decorative image.
 *     The markup is correct as-is; no human wording decision is left open.
 *   - placeholder fixes (`needsReview: true`) — we inserted a TODO `aria-label` because the element
 *     genuinely needs human-authored words we don't have. The STRUCTURE is fixed (the attribute now
 *     exists), but the author must replace the placeholder text, so `note` says so.
 *
 * Returns just the fix fields; the caller stamps on `ruleId` / `kind: "deterministic"` when it builds
 * the full `FixSuggestion`.
 */
import type { AttributePatch, Finding } from "@web-access/shared";

/** The slice of `FixSuggestion` this module is responsible for (caller adds ruleId + kind). */
export interface DeterministicFix {
  /** Original element markup (echoed back from the finding's snippet). */
  before: string;
  /** Corrected element markup the owner can paste in. */
  after: string;
  /** True when a human still has to confirm wording (we inserted a placeholder). */
  needsReview: boolean;
  /** What still needs a human decision, when `needsReview` is true. */
  note?: string;
  /**
   * Structured, machine-applicable form of this fix for Phase C runtime remediation — present only
   * when the transform is a single NON-VISUAL attribute set whose attr is in SAFE_REMEDIATION_ATTRS
   * (lang, alt, the aria-* family, role). Lets the runtime `setAttribute` directly instead of diffing
   * markup. For placeholder fixes (needsReview) we still emit the patch (with the TODO value) so the UI
   * can prefill the approval input — the approval action rejects the placeholder until the owner edits.
   */
  attributePatch?: AttributePatch[];
}

// --- small regex helpers ----------------------------------------------------------------------
// Snippets are short, single-element HTML strings (axe gives us the offending element's outerHTML,
// often truncated), so light regex parsing is enough and avoids dragging a DOM parser into a pure
// module. None of these try to be a real HTML parser — they only need to handle a single opening
// tag plus (optionally) its closing tag.

/** Match the opening tag of a snippet: capture name + the attribute run, e.g. `<a href="…">`. */
const OPENING_TAG = /^(\s*<)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?>)/;

/** Lowercased tag name of the snippet's first element, or null if it doesn't start with a tag. */
function tagNameOf(snippet: string): string | null {
  const m = OPENING_TAG.exec(snippet);
  return m ? m[2]!.toLowerCase() : null;
}

/**
 * Is `attr` present on the snippet's opening tag? Word-boundary + lookahead so `lang` doesn't match
 * inside `data-lang`, and so a bare boolean attribute (`disabled`) matches as well as `attr="…"`.
 */
function hasAttr(snippet: string, attr: string): boolean {
  const m = OPENING_TAG.exec(snippet);
  if (!m) return false;
  const attrs = m[3] ?? "";
  return new RegExp(`(^|\\s)${attr}(\\s|=|/?>|$)`, "i").test(attrs + ">");
}

/** Read the value of `attr` from the opening tag (quoted or bare); null if absent/valueless. */
function attrValue(snippet: string, attr: string): string | null {
  const m = OPENING_TAG.exec(snippet);
  if (!m) return null;
  const attrs = m[3] ?? "";
  const v = new RegExp(`(^|\\s)${attr}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(attrs);
  if (!v) return null;
  return v[3] ?? v[4] ?? v[5] ?? "";
}

/**
 * Insert `attr="value"` into the opening tag, right after the tag name and before any existing
 * attributes (so `<a href="…">` → `<a aria-label="…" href="…">`). Robust to self-closing tags
 * because we splice into the captured attribute run, not at a literal `>`. Returns the snippet
 * unchanged if there's no recognisable opening tag.
 */
function insertAttr(snippet: string, attr: string, value: string): string {
  return snippet.replace(OPENING_TAG, (_full, open, name, attrs, close) => {
    // `attrs` keeps the element's own leading space (e.g. " href=…"); prefix our attr with a space
    // and let the existing run supply the spacing before the originals.
    return `${open}${name} ${attr}="${value}"${attrs}${close}`;
  });
}

/**
 * Does the snippet have non-whitespace visible text between its open and close tags? Used to decide
 * whether a link/button is genuinely empty. We strip nested tags first so `<a><img …></a>` reads as
 * "no text" (the img alt is image-alt's concern, not link-name's). Conservative by design: if there
 * IS leftover text we treat the element as named and bow out.
 */
function hasInnerText(snippet: string): boolean {
  // Drop the leading opening tag and a single trailing closing tag, then strip any inner tags.
  const inner = snippet
    .replace(OPENING_TAG, "")
    .replace(/<\/[a-zA-Z][a-zA-Z0-9-]*\s*>\s*$/, "")
    .replace(/<[^>]*>/g, "");
  return inner.trim().length > 0;
}

/** True when an element already exposes an accessible name via aria-* (so we must not stomp it). */
function hasAccessibleName(snippet: string): boolean {
  return hasAttr(snippet, "aria-label") || hasAttr(snippet, "aria-labelledby");
}

// --- decorative-image heuristics --------------------------------------------------------------
// image-alt is the trickiest case: real content images need human-written alt (AI's job), but a
// clearly DECORATIVE image just needs `alt=""` to be skipped by screen readers — a safe mechanical
// fix. We only claim "decorative" when there's a strong, conservative signal; otherwise → null.

/** Filename fragments that strongly imply a decorative/UI image rather than meaningful content. */
const DECORATIVE_NAME_HINTS = [
  "spacer",
  "icon",
  "icons",
  "decoration",
  "decorative",
  "ornament",
  "divider",
  "separator",
  "bullet",
  "flourish",
  "swirl",
  "pixel",
  "blank",
  "transparent",
  "1x1",
];

/** Pull a lowercased basename out of an `src` value (query/hash stripped); "" if none. */
function basenameOf(src: string): string {
  const path = src.split(/[?#]/)[0] ?? "";
  return (path.split("/").pop() ?? "").toLowerCase();
}

/**
 * Is this `<img>` snippet plausibly decorative? Two conservative signals:
 *   1. the author already declared it presentational (`role="presentation"`/`"none"`) but forgot
 *      the empty alt that should accompany that, or
 *   2. the filename contains a strong decorative hint (spacer.gif, icon-arrow.svg, divider.png…).
 * Anything else (a photo-ish name, no signal) is treated as CONTENT and handed to the AI fixer.
 */
function looksDecorative(snippet: string): boolean {
  const role = (attrValue(snippet, "role") ?? "").toLowerCase();
  if (role === "presentation" || role === "none") return true;

  const src = attrValue(snippet, "src") ?? "";
  if (!src) return false;
  const name = basenameOf(src);
  return DECORATIVE_NAME_HINTS.some((hint) => name.includes(hint));
}

// --- the public entry point -------------------------------------------------------------------

/**
 * Produce a confident mechanical fix for `finding`, or `null` when none applies (unsupported rule,
 * ambiguous markup, the element is already fine, or the fix needs human-authored content this module
 * can't supply). Pure: depends only on `finding.ruleId` and `finding.htmlSnippet`.
 */
export function deterministicFix(finding: Finding): DeterministicFix | null {
  const before = finding.htmlSnippet;
  if (!before || !before.trim()) return null;

  switch (finding.ruleId) {
    // -- Page language: add/repair the <html lang> attribute. ------------------------------------
    // "en" is a guess, but a *safe* default — a declared language (even if it later needs changing
    // to the real one) is strictly better than none, and never produces broken markup. So we keep
    // needsReview=false and just flag the assumption in the note.
    case "html-has-lang":
    case "html-lang-valid": {
      if (tagNameOf(before) !== "html") return null;
      const current = attrValue(before, "lang");
      // A non-empty lang already present means there's nothing safe to mechanically change:
      //   - html-has-lang: it's not actually missing → no-op.
      //   - html-lang-valid: it's malformed, but we can't know the INTENDED language, so guessing
      //     "en" could silently mislabel (e.g. a typo'd "fr"). Leave it for a human.
      // We only step in when lang is entirely absent or present-but-empty (`lang=""`).
      if (current !== null && current.trim() !== "") return null;
      const after = current === null ? insertAttr(before, "lang", "en") : setEmptyLangToEn(before);
      return {
        before,
        after,
        needsReview: false,
        note: '"en" is assumed as the page language — change it if the page is in another language.',
        attributePatch: [{ attr: "lang", value: "en" }],
      };
    }

    // -- Decorative images: add empty alt so screen readers skip them. ---------------------------
    // Content images need human-written alt (the AI fixer), so we bail unless the image looks
    // clearly decorative. Already has an alt attribute? Then image-alt shouldn't have fired and
    // there's nothing for us to add — bow out.
    case "image-alt": {
      if (tagNameOf(before) !== "img") return null;
      if (hasAttr(before, "alt")) return null;
      if (!looksDecorative(before)) return null; // ambiguous/content → leave it for AI
      return {
        before,
        after: insertAttr(before, 'alt', ""),
        needsReview: false,
        note: "This image looks decorative, so empty alt text lets screen readers skip it.",
        attributePatch: [{ attr: "alt", value: "" }],
      };
    }

    // -- Form fields with no label: insert a placeholder aria-label. -----------------------------
    // The correct fix is usually a real <label for="…"> or a real aria-label, but we don't know the
    // matching id or the field's purpose from the snippet alone. The safe deterministic transform is
    // to give the field SOME accessible name slot (so the structure is fixed) and make a human fill
    // in the words → needsReview=true.
    case "label":
    case "select-name":
    case "input-button-name": {
      const tag = tagNameOf(before);
      if (tag !== "input" && tag !== "select" && tag !== "button" && tag !== "textarea") return null;
      if (hasAccessibleName(before)) return null; // already named — nothing safe to add
      return {
        before,
        after: insertAttr(before, "aria-label", "TODO: describe this field"),
        needsReview: true,
        note: "Replace the placeholder aria-label with a real description of this field.",
        // Emitted with the placeholder so the UI can prefill an approval input; the approval action
        // rejects "TODO:" values, forcing the owner to type a real description before it goes live.
        attributePatch: [{ attr: "aria-label", value: "TODO: describe this field" }],
      };
    }

    // -- Empty links / buttons: insert a placeholder aria-label. ---------------------------------
    // Same shape as the form-field case, but the wording differs ("link"/"button") and we first
    // confirm the element is actually empty (no inner text, no existing accessible name) — a link
    // with visible text that axe flagged for some other reason isn't ours to touch.
    case "link-name":
    case "button-name": {
      const tag = tagNameOf(before);
      const isLink = tag === "a";
      const isButton = tag === "button";
      if (!isLink && !isButton) return null;
      if (hasAccessibleName(before)) return null; // already has an accessible name → AI/human's call
      if (hasInnerText(before)) return null; // visible text present → not the empty-name case
      const noun = isLink ? "link" : "button";
      return {
        before,
        after: insertAttr(before, "aria-label", `TODO: describe this ${noun}`),
        needsReview: true,
        note: `Replace the placeholder aria-label with a real description of this ${noun}.`,
        // Emitted with the placeholder so the UI can prefill an approval input; the approval action
        // rejects "TODO:" values, forcing the owner to type a real description before it goes live.
        attributePatch: [{ attr: "aria-label", value: `TODO: describe this ${noun}` }],
      };
    }

    // -- document-title is a <head> concern, not a fix on the offending element. -----------------
    // There's no element-level transform we can return in the before→after shape, so decline.
    case "document-title":
      return null;

    // Everything else (color-contrast, reading-order, heading-order, …) is a judgment/layout issue
    // with no single mechanical markup fix. Decline so the caller falls back to the AI fixer / a
    // plain-language explanation.
    default:
      return null;
  }
}

/**
 * Replace an existing empty/whitespace `lang=""` with `lang="en"` on the opening tag (the
 * html-lang-valid present-but-empty branch). Kept separate from `insertAttr` because here we rewrite
 * an existing attribute value rather than splice in a new attribute.
 */
function setEmptyLangToEn(snippet: string): string {
  return snippet.replace(
    /(\blang\s*=\s*)("(?:[^"]*)"|'(?:[^']*)'|[^\s>]*)/i,
    (_m, lhs) => `${lhs}"en"`,
  );
}
