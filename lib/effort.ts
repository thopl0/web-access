/**
 * Rough fix-effort per rule, used to surface "quick wins" (high impact, low effort). Hand-curated
 * for the common axe / analyzer rules; anything unknown defaults to "medium". Pure + client-safe.
 */
export type Effort = "easy" | "medium" | "hard";

const EFFORT: Record<string, Effort> = {
  // One-attribute / one-line fixes.
  "image-alt": "easy",
  "input-image-alt": "easy",
  "area-alt": "easy",
  "role-img-alt": "easy",
  "svg-img-alt": "easy",
  "object-alt": "easy",
  "alt-text-inaccurate": "easy",
  "decorative-misclassified": "easy",
  label: "easy",
  "label-title-only": "easy",
  "button-name": "easy",
  "input-button-name": "easy",
  "link-name": "easy",
  "document-title": "easy",
  "html-has-lang": "easy",
  "html-lang-valid": "easy",
  "valid-lang": "easy",
  "frame-title": "easy",
  "empty-heading": "easy",
  list: "easy",
  listitem: "easy",
  "definition-list": "easy",
  dlitem: "easy",
  "duplicate-id": "easy",
  "duplicate-id-active": "easy",
  "duplicate-id-aria": "easy",
  "aria-valid-attr": "easy",
  "meta-viewport": "easy",
  "meta-refresh": "easy",
  // Need a design or structural change.
  "color-contrast": "medium",
  "color-contrast-enhanced": "medium",
  "link-in-text-block": "medium",
  "heading-order": "medium",
  "page-has-heading-one": "medium",
  "landmark-one-main": "medium",
  "landmark-unique": "medium",
  region: "medium",
  bypass: "medium",
  "target-size": "medium",
  tabindex: "medium",
  "aria-roles": "medium",
  "aria-allowed-attr": "medium",
  "aria-required-attr": "medium",
  "aria-valid-attr-value": "medium",
  // Behavioural / interaction work.
  "aria-required-children": "hard",
  "aria-required-parent": "hard",
  "scrollable-region-focusable": "hard",
  "focus-order-semantics": "hard",
  "reading-order": "hard",
};

export function effortOf(ruleId: string): Effort {
  return EFFORT[ruleId] ?? "medium";
}

export const EFFORT_LABEL: Record<Effort, string> = {
  easy: "Quick fix",
  medium: "Moderate",
  hard: "Involved",
};
