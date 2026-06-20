/**
 * Deterministic legal-risk scorer — the defensible backbone of the "intelligent report".
 *
 * It ranks accessibility findings by REAL-WORLD LEGAL EXPOSURE so the report can honestly say
 * "these 5 of 47 are what actually draws an ADA / EAA complaint — start here", instead of dumping
 * an undifferentiated list. Pure, free, testable: no AI, no I/O, no network. Same class of module as
 * lib/effort.ts and lib/explain.ts — a hand-curated, ruleId-keyed map with a safe default, client-safe.
 *
 * WHY legal risk is the right axis (the weights below are grounded in this):
 *  - The European Accessibility Act (in force 28 Jun 2025) routes through EN 301 549, which adopts
 *    WCAG 2.1 AA; US ADA Title III is litigated against the same WCAG baseline. In BOTH regimes the
 *    demand letter / lawsuit lands on the SITE OWNER, not the framework or the host.
 *  - WebAIM Million (annual scan of the top 1,000,000 home pages) consistently finds the same handful
 *    of failures dominate: low-contrast text, missing image alt text, empty links, missing form input
 *    labels, empty buttons, and missing document language. These also map almost 1:1 onto the
 *    fact patterns in US ADA Title III "surf-by" complaints and demand letters.
 *  - So the highest-litigation issues are: missing/poor image alt text, missing form labels, low
 *    colour contrast, empty/unclear links and buttons, missing document language, keyboard/focus
 *    blockers, and missing/uninformative page titles. We weight these "high".
 *  - WCAG LEVEL A failures (the floor every regime requires) carry more exposure than AA-only ones,
 *    and CRITICAL/SERIOUS user impact carries more than MODERATE/MINOR. We fold both in as modifiers.
 *
 * Scoring model (all numbers on a 0..100 scale so they read as an intuitive "risk score"):
 *   final weight = baseRiskWeight(ruleId)  // hand-curated litigation likelihood, the dominant signal
 *                + levelModifier(wcag)      // Level A failures are the legal floor -> more exposure
 *                + impactModifier(impact)   // critical/serious harm -> more exposure
 *   clamped to [0, 100]; then tier is derived from the weight via fixed cutoffs, so tier and weight
 *   are always internally consistent (a higher weight can never sit in a lower tier).
 */

export type RiskTier = "high" | "medium" | "low";

export interface LegalRisk {
  tier: RiskTier;
  /** 0..100 risk score; higher = greater legal exposure. Drives ranking AND the derived tier. */
  weight: number;
  /** ONE plain, non-alarmist sentence a non-lawyer owner understands: why this draws complaints. */
  why: string;
}

export interface RankedFinding<T> {
  item: T;
  risk: LegalRisk;
}

export const RISK_TIER_LABEL: Record<RiskTier, string> = {
  high: "Top legal risk",
  medium: "Moderate legal risk",
  low: "Lower legal risk",
};

/* ------------------------------------------------------------------ *
 * Per-rule base risk: litigation likelihood for the issue itself.
 * This is the dominant signal; level/impact only nudge it.
 * ------------------------------------------------------------------ */

type BaseRisk = "high" | "medium" | "low";

const BASE_RISK_WEIGHT: Record<BaseRisk, number> = {
  high: 60,
  medium: 35,
  low: 15,
};

/** Unknown rules are treated as a cautious MEDIUM — never silently dismissed, never overstated. */
const DEFAULT_BASE: BaseRisk = "medium";

/**
 * Hand-curated base risk per ruleId. Covers the real axe vocabulary plus the Tier-3 AI ruleIds.
 * "high" == the recurring fact patterns in ADA Title III complaints / EAA-relevant failures and the
 * top of the WebAIM Million; "low" == real issues that rarely anchor a legal claim on their own.
 */
const BASE_RISK: Record<string, BaseRisk> = {
  // --- Missing / poor image alt text. The single most common basis for ADA web complaints. ---
  "image-alt": "high",
  "input-image-alt": "high",
  "area-alt": "high",
  "role-img-alt": "high",
  "svg-img-alt": "high",
  "object-alt": "high",
  "alt-text-inaccurate": "high",
  "alt-text-filename": "medium",
  "alt-text-uninformative": "medium",
  "alt-text-redundant": "low",
  "decorative-misclassified": "high",

  // --- Missing form labels: keeps disabled users from completing checkout / contact / sign-up. ---
  label: "high",
  "label-title-only": "medium",
  "select-name": "high",
  "form-field-multiple-labels": "medium",
  "form-error-unclear": "medium",

  // --- Low colour contrast: the #1 WebAIM Million failure and a staple of demand letters. ---
  "color-contrast": "high",
  "color-contrast-enhanced": "low", // AAA-level enhanced contrast — beyond the legal baseline.
  "link-in-text-block": "medium",
  "color-only-reference": "medium",
  "use-of-color": "medium",

  // --- Empty / unclear links and buttons: blind users hear "link"/"button" with no destination. ---
  "link-name": "high",
  "button-name": "high",
  "input-button-name": "high",
  "link-purpose-unclear": "medium",
  "ambiguous-repeated-links": "medium",
  "aria-command-name": "high",
  "aria-toggle-field-name": "high",

  // --- Missing / wrong document language: screen readers mispronounce the whole page. ---
  "html-has-lang": "high",
  "html-lang-valid": "high",
  "valid-lang": "medium",
  "html-xml-lang-mismatch": "low",

  // --- Missing / uninformative page title: users can't identify the page; named in WCAG 2.4.2 (A). ---
  "document-title": "high",
  "page-title-uninformative": "medium",

  // --- Keyboard / focus blockers: a keyboard user who can't reach or operate content is locked out. ---
  "scrollable-region-focusable": "high",
  "focus-order-semantics": "medium",
  "tabindex": "medium",
  "positive-tabindex": "medium",
  bypass: "medium",
  "reading-order": "medium",

  // --- Heading / structure quality: hurts navigation but rarely anchors a complaint alone. ---
  "heading-uninformative": "low",
  "empty-heading": "medium",
  "heading-order": "low",
  "page-has-heading-one": "low",
  "landmark-one-main": "low",
  "landmark-unique": "low",
  region: "low",

  // --- Lists & grouping semantics: minor on their own. ---
  list: "low",
  listitem: "low",
  "definition-list": "low",
  dlitem: "low",

  // --- ARIA correctness: serious when it breaks an interactive widget, otherwise moderate. ---
  "aria-required-attr": "medium",
  "aria-required-children": "medium",
  "aria-required-parent": "medium",
  "aria-roles": "medium",
  "aria-allowed-attr": "medium",
  "aria-valid-attr": "low",
  "aria-valid-attr-value": "medium",
  "aria-hidden-focus": "medium",
  "aria-input-field-name": "high",

  // --- Frames & embedded content. ---
  "frame-title": "medium",

  // --- Misc best-practice / low-stakes. ---
  "duplicate-id": "low",
  "duplicate-id-active": "low",
  "duplicate-id-aria": "low",
  "meta-viewport": "medium", // blocking zoom is a documented complaint basis, but narrower than the above.
  "meta-refresh": "low",
  "target-size": "low",
};

/* ------------------------------------------------------------------ *
 * Modifiers: WCAG level (legal floor) and user impact (harm severity).
 * ------------------------------------------------------------------ */

/**
 * Minimal Level-A success-criterion set, inlined to keep this module dependency-free and client-safe
 * (mirrors how effort.ts / explain.ts stay self-contained). Any SC tagged on a finding that is a
 * Level A criterion makes the finding part of the legal floor that EVERY regime requires.
 * Kept deliberately short: only criteria that realistically surface as automated/AI findings here.
 */
const LEVEL_A_SC = new Set<string>([
  "1.1.1", // Non-text Content (alt text)
  "1.2.1",
  "1.2.2",
  "1.2.3",
  "1.3.1", // Info and Relationships (labels, lists, structure)
  "1.3.2", // Meaningful Sequence (reading order)
  "1.3.3", // Sensory Characteristics (colour/position-only instructions)
  "1.4.1", // Use of Color
  "1.4.2",
  "2.1.1", // Keyboard
  "2.1.2", // No Keyboard Trap
  "2.4.1", // Bypass Blocks
  "2.4.2", // Page Titled
  "2.4.3", // Focus Order
  "2.4.4", // Link Purpose (In Context)
  "2.5.3",
  "3.1.1", // Language of Page
  "3.2.1",
  "3.2.2",
  "3.3.1", // Error Identification
  "3.3.2", // Labels or Instructions
  "4.1.2", // Name, Role, Value
]);

/** +8 if any tagged SC is Level A (the legal baseline), 0 if AA-only or none present. */
function levelModifier(wcag: string[]): number {
  for (const sc of wcag) {
    if (LEVEL_A_SC.has(sc)) return 8;
  }
  return 0;
}

/** Harm severity modifier. Null/unknown impact is treated as neutral (0). */
function impactModifier(impact: string | null): number {
  switch (impact) {
    case "critical":
      return 12;
    case "serious":
      return 6;
    case "moderate":
      return 0;
    case "minor":
      return -6;
    default:
      return 0;
  }
}

/* ------------------------------------------------------------------ *
 * Tier cutoffs — derived from the final weight so tier ⇔ weight stay consistent.
 * ------------------------------------------------------------------ */

const HIGH_CUTOFF = 55; // a "high" base rule (60) lands here even before modifiers.
const MEDIUM_CUTOFF = 30; // a "medium" base rule (35) lands here; "low" base (15) stays low.

function tierFor(weight: number): RiskTier {
  if (weight >= HIGH_CUTOFF) return "high";
  if (weight >= MEDIUM_CUTOFF) return "medium";
  return "low";
}

/* ------------------------------------------------------------------ *
 * Plain-language "why this draws complaints" sentences, per base risk + a few specific overrides.
 * ------------------------------------------------------------------ */

/** Rule-specific reasons, where a generic sentence would be too vague to be persuasive. */
const WHY_BY_RULE: Record<string, string> = {
  "image-alt":
    "Screen-reader users can't tell what this image shows — the single most common basis for ADA web complaints.",
  "input-image-alt":
    "An image used as a button has no description, so screen-reader users can't tell what it does — a frequent ADA complaint point.",
  "alt-text-inaccurate":
    "The image's description doesn't match the image, so screen-reader users get the wrong information — a documented ADA complaint pattern.",
  "decorative-misclassified":
    "A meaningful image is hidden from screen readers, so blind users miss content they're legally entitled to access.",
  label:
    "A form field with no label stops disabled users completing checkout or contact forms — a recurring basis for ADA lawsuits.",
  "select-name":
    "A dropdown with no accessible name blocks screen-reader users from choosing an option — a common form-accessibility complaint.",
  "color-contrast":
    "Low-contrast text is the most common accessibility failure online and a staple of ADA demand letters.",
  "link-name":
    "A link with no readable text just announces as \"link\" to blind users — among the most-cited issues in ADA web complaints.",
  "button-name":
    "A button with no readable text leaves screen-reader users unable to act — a frequent basis for ADA complaints.",
  "html-has-lang":
    "With no page language set, screen readers may read the whole page in the wrong accent — a clear WCAG Level A failure regulators flag.",
  "document-title":
    "A page with no title fails WCAG 2.4.2 (Level A), the legal floor under both the ADA and the European Accessibility Act.",
  "scrollable-region-focusable":
    "Keyboard users can't reach scrollable content, locking them out entirely — exactly the kind of barrier that draws complaints.",
  "meta-viewport":
    "Blocking zoom stops low-vision users enlarging text, a barrier specifically named in accessibility complaints.",
};

/** Fallback sentence by base-risk tier, when no rule-specific reason is curated. */
const WHY_BY_BASE: Record<BaseRisk, string> = {
  high:
    "This is one of the failures that most often triggers an ADA Title III or European Accessibility Act complaint, so fix it first.",
  medium:
    "This creates a real barrier for disabled visitors and can contribute to an accessibility complaint, though it rarely anchors one alone.",
  low:
    "This is worth fixing for usability, but on its own it's an unlikely basis for a legal accessibility complaint.",
};

function whyFor(ruleId: string, base: BaseRisk): string {
  return WHY_BY_RULE[ruleId] ?? WHY_BY_BASE[base];
}

/* ------------------------------------------------------------------ *
 * Public API.
 * ------------------------------------------------------------------ */

/**
 * Score one finding's legal exposure. Pure: same inputs always yield the same {tier, weight, why}.
 */
export function legalRiskOf(ruleId: string, wcag: string[], impact: string | null): LegalRisk {
  const base: BaseRisk = BASE_RISK[ruleId] ?? DEFAULT_BASE;
  const raw = BASE_RISK_WEIGHT[base] + levelModifier(wcag) + impactModifier(impact);
  const weight = Math.max(0, Math.min(100, raw));
  return {
    tier: tierFor(weight),
    weight,
    why: whyFor(ruleId, base),
  };
}

/**
 * Rank findings by legal exposure, highest first. STABLE: findings with equal weight keep their
 * original relative order (so the caller's prior ordering — e.g. by selector — is preserved).
 */
export function rankByLegalRisk<
  T extends { ruleId: string; wcag: string[]; impact: string | null },
>(items: T[]): RankedFinding<T>[] {
  return items
    .map((item, index) => ({ item, index, risk: legalRiskOf(item.ruleId, item.wcag, item.impact) }))
    .sort((a, b) => b.risk.weight - a.risk.weight || a.index - b.index)
    .map(({ item, risk }) => ({ item, risk }));
}
