/**
 * Labeled eval corpus for the colour-only-cue judge (`judgeColorOnly`, GLM, WCAG 1.4.1). Each case is
 * a `ColorOnlyCandidate` exactly as `collectColorRefs` would yield it, plus the gold label a human
 * assigned and the rationale. This is the regression-guard data the plan (§6/§8.4) requires before the
 * AI tier is trusted: re-running it on every prompt/model change is how a quietly-worse judge gets
 * caught.
 *
 * Coverage is intentional, not random. This check is FALSE-POSITIVE PRONE — colour words appear in
 * ordinary prose constantly and almost none are an accessibility problem — so the corpus is heavily
 * weighted toward the HARD `ok` negatives the prompt must NOT flag: brands/proper nouns, descriptive
 * prose, colour-alongside-another-cue, product/option names, and idioms. The positive cases cover the
 * real failure shapes: an imperative pointing only at a colour, a "marked/shown in <colour>" status
 * cue, a colour-coded chart/legend, and a colour-coded list/state with no other label.
 *
 * Gold-labeling caveat (plan §6): a single author labeled these — the clear, defensible cases. The
 * plan calls for 2–3 expert labelers + inter-rater agreement before treating absolute numbers as
 * ground truth. Until then this guards against *regressions* (relative drift), which is its job here.
 */
import type { ColorOnlyCandidate } from "../../colorOnly";
import type { EvalCase } from "../types";

/** Build a full `ColorOnlyCandidate` from the few fields a case cares about; rest get inert defaults. */
function snip(over: Partial<ColorOnlyCandidate> & { text: string }): ColorOnlyCandidate {
  return {
    selector: "p",
    ...over,
  };
}

type ColorCase = EvalCase<ColorOnlyCandidate>;

export const COLOR_ONLY_CORPUS: ColorCase[] = [
  // ── colour is the SOLE cue → "color-only-reference" (true positives) ───────────────────────────
  {
    id: "pos-click-green-button",
    context: "forms",
    input: snip({ text: "Click the green button to continue." }),
    gold: "color-only-reference",
    notes: "Button identified by colour alone, no label — fails colour-blind/screen-reader users.",
  },
  {
    id: "pos-required-red",
    context: "forms",
    input: snip({ text: "Required fields are marked in red." }),
    gold: "color-only-reference",
    notes: "Status (required) conveyed by colour only; no asterisk/word/icon mentioned.",
  },
  {
    id: "pos-soldout-red",
    context: "ecommerce",
    input: snip({ text: "Items shown in red are sold out." }),
    gold: "color-only-reference",
    notes: "Availability state coded by colour alone.",
  },
  {
    id: "pos-revenue-blue-line",
    context: "app-ui",
    input: snip({ text: "The blue line is revenue and the orange line is cost." }),
    gold: "color-only-reference",
    notes: "Chart series distinguished only by colour — unreadable to colour-blind users.",
  },
  {
    id: "pos-see-text-blue",
    context: "docs",
    input: snip({ text: "See the text in blue for the updated instructions." }),
    gold: "color-only-reference",
    notes: "Points the reader at content by colour alone.",
  },
  {
    id: "pos-press-green",
    context: "app-ui",
    input: snip({ text: "Press the green icon to start recording." }),
    gold: "color-only-reference",
    notes: "Control identified by colour only, no accessible label given in the instruction.",
  },
  {
    id: "pos-legend-green-means",
    context: "docs",
    input: snip({ text: "Green means available, red means booked." }),
    gold: "color-only-reference",
    notes: "Colour-coded legend with no text/shape alternative — classic 1.4.1 failure.",
  },
  {
    id: "pos-overdue-yellow",
    context: "app-ui",
    input: snip({ text: "Rows highlighted in yellow are overdue." }),
    gold: "color-only-reference",
    notes: "Row state conveyed by highlight colour alone.",
  },
  {
    id: "pos-select-purple",
    context: "marketing",
    input: snip({ text: "Choose the purple plan for the best value." }),
    gold: "color-only-reference",
    notes: "Plan option referenced by colour only, no plan name given here.",
  },

  // ── proper nouns / brands → "ok" (hard negatives) ──────────────────────────────────────────────
  {
    id: "ok-brand-red-sox",
    context: "blog",
    input: snip({ text: "The Red Sox won the series last night." }),
    gold: "ok",
    notes: "Proper noun (team name), not an instruction about colour — must NOT flag.",
  },
  {
    id: "ok-brand-bluetooth",
    context: "ecommerce",
    input: snip({ text: "Pair the headphones over Bluetooth in seconds." }),
    gold: "ok",
    notes: '"Bluetooth" is a brand, not a colour cue.',
  },
  {
    id: "ok-brand-red-hat",
    context: "docs",
    input: snip({ text: "These steps were tested on Red Hat Enterprise Linux." }),
    gold: "ok",
    notes: "Product/brand name, not a colour-only instruction.",
  },
  {
    id: "ok-brand-greenpeace",
    context: "marketing",
    input: snip({ text: "A portion of proceeds is donated to Greenpeace." }),
    gold: "ok",
    notes: "Organisation name containing a colour word — not a cue.",
  },

  // ── descriptive prose → "ok" ───────────────────────────────────────────────────────────────────
  {
    id: "ok-prose-red-sunset",
    context: "blog",
    input: snip({ text: "We watched a red sunset fade over the green hills." }),
    gold: "ok",
    notes: "Pure description; the user isn't asked to act on colour.",
  },
  {
    id: "ok-prose-blue-sky",
    context: "marketing",
    input: snip({ text: "Picture clear blue skies and a long open road." }),
    gold: "ok",
    notes: "Evocative copy, no instruction.",
  },

  // ── colour ALONGSIDE another cue → "ok" (the label disambiguates) ──────────────────────────────
  {
    id: "ok-green-submit-button",
    context: "forms",
    input: snip({ text: 'Click the green "Submit" button to send your form.' }),
    gold: "ok",
    notes: 'The label "Submit" identifies the button — colour is not the sole cue.',
  },
  {
    id: "ok-red-delete-icon",
    context: "app-ui",
    input: snip({ text: "Press the red Delete icon to remove the file." }),
    gold: "ok",
    notes: 'The word "Delete" disambiguates the control.',
  },
  {
    id: "ok-required-asterisk-and-red",
    context: "forms",
    input: snip({ text: "Required fields are marked with an asterisk and shown in red." }),
    gold: "ok",
    notes: "An asterisk is given alongside the colour, so colour isn't the only indicator.",
  },

  // ── product / option names → "ok" ──────────────────────────────────────────────────────────────
  {
    id: "ok-available-red-blue",
    context: "ecommerce",
    input: snip({ text: "This jacket is available in red and blue." }),
    gold: "ok",
    notes: "Colours are product options, not a way to identify a control or state.",
  },
  {
    id: "ok-comes-in-green",
    context: "ecommerce",
    input: snip({ text: "The kettle also comes in green and cream." }),
    gold: "ok",
    notes: "Colour as a product variant, not an instruction.",
  },

  // ── idioms / figures of speech → "ok" ──────────────────────────────────────────────────────────
  {
    id: "ok-idiom-in-the-red",
    context: "blog",
    input: snip({ text: "The company finished the quarter in the red." }),
    gold: "ok",
    notes: 'Idiom ("in the red" = losing money), not a UI colour cue.',
  },
  {
    id: "ok-idiom-green-light",
    context: "marketing",
    input: snip({ text: "Once legal gives the green light, we ship." }),
    gold: "ok",
    notes: 'Idiom ("green light" = approval), not an instruction to act on colour.',
  },
  {
    id: "ok-idiom-red-flag",
    context: "docs",
    input: snip({ text: "A sudden spike in errors is a red flag worth investigating." }),
    gold: "ok",
    notes: 'Idiom ("red flag" = warning sign), figurative, not a colour-coded UI state.',
  },

  // ── ADVERSARIAL: nasty hard-negatives that pass the pre-filter but must stay "ok" ───────────────
  {
    id: "adv-find-red-hat",
    context: "docs",
    input: snip({ text: "Find Red Hat support quickly from the help menu." }),
    gold: "ok",
    notes:
      'Imperative "find … red" trips cueRe, but "Red Hat" is a brand and the action targets a menu link, not a colour. Naive prompt may flag the find+red pattern.',
  },
  {
    id: "adv-tap-blue-wifi-icon",
    context: "app-ui",
    input: snip({ text: "Tap the blue Wi-Fi icon at the top to reconnect." }),
    gold: "ok",
    notes:
      'Colour appears with a real disambiguator ("Wi-Fi icon") plus a position ("at the top"); colour is not the sole cue, even though "tap … blue" matches the imperative pattern.',
  },
  {
    id: "adv-choose-see-red-flags",
    context: "blog",
    input: snip({ text: "Learn to see the red flags before you choose a vendor." }),
    gold: "ok",
    notes:
      'Doubly trips cueRe ("see … red", "choose"), but "red flags" is an idiom (warning signs); no UI control or state is referenced.',
  },
  {
    id: "adv-the-green-soap-bar",
    context: "ecommerce",
    input: snip({ text: "The green bar of soap is stocked in aisle five." }),
    gold: "ok",
    notes:
      '"the green … bar" matches the "the <colour> <thing>" reference pattern, but it describes a physical product located by aisle number, not a colour-coded UI element.',
  },
  {
    id: "adv-overdue-shown-red-and-labelled",
    context: "app-ui",
    input: snip({ text: "Overdue invoices are shown in red and labelled \"Overdue\"." }),
    gold: "ok",
    notes:
      'Matches "shown in red", but the same sentence gives an explicit text label ("Overdue"), so colour is NOT the only indicator. Tests whether the judge reads the WHOLE sentence before flagging.',
  },
  {
    id: "adv-legend-green-check-symbol",
    context: "docs",
    input: snip({ text: "Green means available (✓) and red means booked (✗)." }),
    gold: "ok",
    notes:
      'Looks like the classic colour legend ("green means …"), but each state also carries a distinct symbol (✓ / ✗), so colour is not the sole cue — must stay ok.',
  },
  {
    id: "adv-see-red-metaphor",
    context: "marketing",
    input: snip({ text: "Don't let one bad review make you see red." }),
    gold: "ok",
    notes:
      '"make you see red" trips the "see … red" imperative pattern but is an anger idiom, not an instruction to act on a colour.',
  },
  {
    id: "adv-pick-red-colourway",
    context: "ecommerce",
    input: snip({ text: "Pick the red colourway if you want something bold." }),
    gold: "ok",
    notes:
      '"pick … red" matches the imperative, but the red is a product variant the user is free to choose, not a control identified solely by colour.',
  },
  {
    id: "adv-use-the-blue-area-decor",
    context: "blog",
    input: snip({ text: "Use the blue area of the rug to anchor the seating." }),
    gold: "ok",
    notes:
      '"use … blue" and "the blue … area" both match, but this is interior-design prose about a physical rug, not a UI region the user must locate by colour.',
  },

  // ── ADVERSARIAL: subtle true-positives a lenient prompt would wrongly pass ──────────────────────
  {
    id: "adv-green-one-pronoun",
    context: "forms",
    input: snip({ text: "Click the green one to confirm your booking." }),
    gold: "color-only-reference",
    notes:
      'A lenient judge might treat "the green one" as having a noun, but "one" is a pronoun with no label/shape — colour is still the sole identifier. Real 1.4.1 failure.',
  },
  {
    id: "adv-anything-in-red-soft",
    context: "app-ui",
    input: snip({ text: "Anything shown in red still needs your attention." }),
    gold: "color-only-reference",
    notes:
      'Phrased as gentle description, not an imperative, but it ties an actionable state (needs attention) to colour alone — should still be flagged.',
  },
  {
    id: "adv-capitalised-red-state",
    context: "app-ui",
    input: snip({ text: "Records flagged in Red are locked for editing." }),
    gold: "color-only-reference",
    notes:
      'Capital "Red" mimics a proper noun, but here it is the colour state ("flagged in Red") and the only cue for the locked status — a colour-only failure the casing must not hide.',
  },
];
