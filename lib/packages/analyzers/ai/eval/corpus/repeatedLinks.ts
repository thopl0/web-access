/**
 * Labeled eval corpus for the TEXT repeated-links judge (`judgeRepeatedLinks`, GLM). Each case is a
 * `RepeatedLinkGroup` exactly as `collectRepeatedLinkGroups` would yield it (a GROUP of same-named
 * links pointing at 2+ distinct destinations), plus the gold label a human assigned and the rationale.
 * This is the regression-guard data the plan (§6/§8.4) requires before the AI tier is trusted:
 * re-running it on every prompt/model change is how a quietly-worse judge gets caught.
 *
 * Coverage is intentional, not random: the positive class (genuinely ambiguous repeated names with no
 * disambiguating context) AND a large set of `ok` negatives — especially the HARD negatives the prompt
 * is told NOT to flag: per-link context that already disambiguates, pagination numbers, Next/Previous
 * pairs, and self-describing names. Precision is the headline target (≥0.85), so the corpus is weighted
 * toward catching false positives, the failure that erodes user trust fastest.
 *
 * Gold-labeling caveat (plan §6): a single author labeled these — the clear, defensible cases. The plan
 * calls for 2–3 expert labelers + inter-rater agreement before treating absolute numbers as ground
 * truth. Until then this guards against *regressions* (relative drift), which is its job here.
 */
import type { RepeatedLinkGroup } from "../../repeatedLinks";
import type { EvalCase } from "../types";

/** Build a full `RepeatedLinkGroup` from the few fields a case cares about; the rest get inert
 *  defaults. `occurrences` defaults to the number of contexts (falling back to the destination count). */
function group(
  over: Partial<RepeatedLinkGroup> & { linkText: string; destinations: string[] },
): RepeatedLinkGroup {
  const contexts = over.contexts ?? [];
  return {
    occurrences: contexts.length || over.destinations.length,
    contexts: [],
    selector: "a",
    ...over,
  };
}

type RepeatedLinkCase = EvalCase<RepeatedLinkGroup>;

export const REPEATED_LINKS_CORPUS: RepeatedLinkCase[] = [
  // ── genuinely ambiguous → "ambiguous-repeated-links" ─────────────────────────────────────────
  {
    id: "amb-read-more-no-context",
    context: "blog",
    input: group({
      linkText: "Read more",
      destinations: ["/post/spring-sale", "/post/new-hires", "/post/q2-results"],
      contexts: ["", "", ""],
    }),
    gold: "ambiguous-repeated-links",
    notes: 'Three "Read more" links, no surrounding cue to tell the articles apart.',
  },
  {
    id: "amb-download-files",
    context: "docs",
    input: group({
      linkText: "Download",
      destinations: ["/files/2022.pdf", "/files/2023.pdf", "/files/2024.pdf"],
      contexts: ["", "", ""],
    }),
    gold: "ambiguous-repeated-links",
    notes: "Several bare \"Download\" links to different files; the name alone cannot distinguish them.",
  },
  {
    id: "amb-click-here",
    context: "marketing",
    input: group({
      linkText: "Click here",
      destinations: ["/pricing", "/features", "/contact"],
      contexts: ["", "", ""],
    }),
    gold: "ambiguous-repeated-links",
    notes: "Classic non-descriptive \"Click here\" repeated to unrelated destinations.",
  },
  {
    id: "amb-learn-more-cards",
    context: "marketing",
    input: group({
      linkText: "Learn more",
      destinations: ["/plans/basic", "/plans/pro", "/plans/enterprise"],
      contexts: ["Learn more", "Learn more", "Learn more"],
    }),
    gold: "ambiguous-repeated-links",
    notes: "Context just echoes the link text — no real disambiguation, three plan links read alike.",
  },
  {
    id: "amb-view",
    context: "ecommerce",
    input: group({
      linkText: "View",
      destinations: ["/p/101", "/p/102", "/p/103", "/p/104"],
      contexts: ["", "", "", ""],
    }),
    gold: "ambiguous-repeated-links",
    notes: 'Bare "View" repeated across product rows with no per-link context.',
  },
  {
    id: "amb-details",
    context: "ecommerce",
    input: group({
      linkText: "Details",
      destinations: ["/order/55", "/order/56", "/order/57"],
      contexts: ["", "", ""],
    }),
    gold: "ambiguous-repeated-links",
    notes: '"Details" to different orders with no surrounding order identifier.',
  },
  {
    id: "amb-more-info-app",
    context: "app-ui",
    input: group({
      linkText: "More info",
      destinations: ["/help/billing", "/help/security", "/help/api"],
      contexts: ["", "", ""],
    }),
    gold: "ambiguous-repeated-links",
    notes: "Generic \"More info\" links across help topics, no distinguishing context.",
  },
  {
    id: "amb-here-forms",
    context: "forms",
    input: group({
      linkText: "here",
      destinations: ["/terms", "/privacy", "/refund-policy"],
      contexts: ["read the terms", "read the privacy", "read the refund"],
    }),
    gold: "ambiguous-repeated-links",
    notes: 'Inline "here" links; the announced name is just "here" and contexts are near-identical fragments.',
  },

  // ── NOT ambiguous → "ok": context disambiguates ──────────────────────────────────────────────
  {
    id: "ok-read-more-with-headings",
    context: "blog",
    input: group({
      linkText: "Read more",
      destinations: ["/post/spring-sale", "/post/new-hires"],
      contexts: [
        "Spring sale starts Monday: up to 40% off across the store",
        "We welcomed three new engineers to the platform team this week",
      ],
    }),
    gold: "ok",
    notes: 'Each "Read more" sits under its own distinct article title — 2.4.4 in-context purpose is clear.',
  },
  {
    id: "ok-download-with-context",
    context: "docs",
    input: group({
      linkText: "Download",
      destinations: ["/files/2023.pdf", "/files/2024.pdf"],
      contexts: ["2023 annual report (PDF, 2.1 MB)", "2024 annual report (PDF, 1.8 MB)"],
    }),
    gold: "ok",
    notes: "Surrounding text names each file/year — destinations are clearly distinguished.",
  },
  {
    id: "ok-view-product-named",
    context: "ecommerce",
    input: group({
      linkText: "View",
      destinations: ["/p/101", "/p/102"],
      contexts: ["Aeron office chair, ergonomic mesh back", "Standing desk, electric height adjust"],
    }),
    gold: "ok",
    notes: "Each \"View\" sits inside a card naming the specific product.",
  },
  {
    id: "ok-learn-more-plan-named",
    context: "marketing",
    input: group({
      linkText: "Learn more",
      destinations: ["/plans/pro", "/plans/enterprise"],
      contexts: ["Pro plan — for growing teams, $29/mo", "Enterprise plan — SSO, audit logs, SLA"],
    }),
    gold: "ok",
    notes: "Context names the specific plan; purpose is clear in context.",
  },

  // ── HARD negatives the prompt must not flag ──────────────────────────────────────────────────
  {
    id: "ok-pagination-numbers",
    context: "blog",
    input: group({
      linkText: "2",
      destinations: ["/blog?page=2", "/search?page=2"],
      contexts: ["", ""],
    }),
    gold: "ok",
    notes: "Pagination number is itself the distinguishing label — do not flag.",
  },
  {
    id: "ok-next-prev",
    context: "blog",
    input: group({
      linkText: "Next",
      destinations: ["/blog?page=3", "/gallery?page=3"],
      contexts: ["", ""],
    }),
    gold: "ok",
    notes: "\"Next\" is conventional sequential navigation — clear, not ambiguous.",
  },
  {
    id: "ok-previous",
    context: "docs",
    input: group({
      linkText: "Previous",
      destinations: ["/docs/intro", "/docs/setup"],
      contexts: ["", ""],
    }),
    gold: "ok",
    notes: '"Previous" navigation pair — conventional and clear.',
  },
  {
    id: "ok-self-describing-product",
    context: "ecommerce",
    input: group({
      linkText: "iPhone 15 Pro",
      destinations: ["/p/iphone-15-pro?color=black", "/p/iphone-15-pro?color=blue"],
      contexts: ["Black titanium", "Blue titanium"],
    }),
    gold: "ok",
    notes: "Name is already specific; context names the variant — fully distinguished.",
  },
  {
    id: "ok-breadcrumb-home",
    context: "marketing",
    input: group({
      linkText: "Home",
      destinations: ["/", "/?ref=footer"],
      contexts: ["", ""],
    }),
    gold: "ok",
    notes: "Same logical destination (home) reached two ways — not a meaningful ambiguity.",
  },
  {
    id: "ok-skip-link-and-anchor",
    context: "app-ui",
    input: group({
      linkText: "Settings",
      destinations: ["/settings/profile", "/settings/billing"],
      contexts: ["Profile — name, avatar, timezone", "Billing — plan, invoices, payment method"],
    }),
    gold: "ok",
    notes: "\"Settings\" nav whose surrounding section text names the sub-area.",
  },
  {
    id: "ok-page-numbers-3",
    context: "ecommerce",
    input: group({
      linkText: "3",
      destinations: ["/c/shoes?page=3", "/c/bags?page=3"],
      contexts: ["", ""],
    }),
    gold: "ok",
    notes: "Numeric pagination across two listings — the number is the label.",
  },

  // ── ADVERSARIAL hard negatives (must stay "ok"): a naive prompt would wrongly flag these ──────
  {
    id: "adv-tracking-param-same-page",
    context: "marketing",
    input: group({
      linkText: "Get started",
      destinations: ["/signup?utm_source=hero", "/signup?utm_source=footer"],
      contexts: ["", ""],
    }),
    gold: "ok",
    notes:
      "Same destination (/signup) reached twice; the 'distinct destinations' are only tracking-param variants, so there is nothing to disambiguate — collect's href-dedup makes this LOOK like a multi-target group but it is one page.",
  },
  {
    id: "adv-in-page-anchors-toc",
    context: "docs",
    input: group({
      linkText: "Top",
      destinations: ["/guide#section-1", "/guide#section-2", "/guide#section-3"],
      contexts: ["", "", ""],
    }),
    gold: "ok",
    notes:
      "'Back to top' anchors scattered through one long page; each href is technically distinct (different #fragment) but all return the reader to the same logical place — conventional and not destination-ambiguity.",
  },
  {
    id: "adv-self-describing-name-empty-context",
    context: "docs",
    input: group({
      linkText: "2024 Annual Report (PDF)",
      destinations: ["/files/annual-2024.pdf", "/files/annual-2024-print.pdf"],
      contexts: ["", ""],
    }),
    gold: "ok",
    notes:
      "Context is empty, but the NAME itself fully describes the target (screen/print versions of the same named report). A prompt that only looks for disambiguating CONTEXT and ignores a self-describing NAME would wrongly flag this.",
  },
  {
    id: "adv-localized-context-cue",
    context: "blog",
    input: group({
      linkText: "Lire la suite",
      destinations: ["/post/budget-2024", "/post/elections"],
      contexts: [
        "Le budget 2024 prévoit une hausse des dépenses de santé",
        "Les élections municipales auront lieu en mars prochain",
      ],
    }),
    gold: "ok",
    notes:
      "Non-English ('Read more' in French) with distinct French article titles as context. Purpose is clear in context; a model anchored on English keyword lists must not flag a foreign-language page just because it can't pattern-match 'Read more'.",
  },
  {
    id: "adv-per-row-edit-with-context",
    context: "app-ui",
    input: group({
      linkText: "Edit",
      destinations: ["/users/12/edit", "/users/13/edit", "/users/14/edit"],
      contexts: [
        "Ada Lovelace — admin — last active 2h ago",
        "Alan Turing — editor — last active yesterday",
        "Grace Hopper — viewer — last active 5m ago",
      ],
    }),
    gold: "ok",
    notes:
      "Bare 'Edit' per table row, but each row's surrounding text names the specific user being edited — in-context purpose is clear. A naive prompt flags 'Edit' on sight; the table-row context disambiguates.",
  },
  {
    id: "adv-next-page-conventional",
    context: "ecommerce",
    input: group({
      linkText: "Next page",
      destinations: ["/c/shoes?page=2", "/c/shoes?page=3"],
      contexts: ["", ""],
    }),
    gold: "ok",
    notes:
      "'Next page' within one paginated listing — conventional sequential nav. The prompt's exception lists bare 'Next'/'Previous'; this variant wording must be treated the same and not flagged.",
  },
  {
    id: "adv-breadcrumb-category-repeat",
    context: "ecommerce",
    input: group({
      linkText: "Shoes",
      destinations: ["/c/shoes", "/c/shoes?sort=price"],
      contexts: ["Home / Shoes / Running", "Showing 240 results in Shoes"],
    }),
    gold: "ok",
    notes:
      "Same 'Shoes' category reached via breadcrumb and a sorted view — self-describing specific name pointing at the same logical category; not a meaningful ambiguity.",
  },
  {
    id: "adv-context-names-target-no-keyword",
    context: "ecommerce",
    input: group({
      linkText: "Add to cart",
      destinations: ["/cart/add/sku-101", "/cart/add/sku-102"],
      contexts: ["Wireless mouse — $24.99", "Mechanical keyboard — $89.00"],
    }),
    gold: "ok",
    notes:
      "'Add to cart' is generic, but each button sits in a card naming the specific product; the action's target is clear in context. Should stay ok.",
  },

  // ── ADVERSARIAL true-positives (genuinely ambiguous; must be flagged despite looking safe) ────
  {
    id: "adv-context-identical-not-disambiguating",
    context: "blog",
    input: group({
      linkText: "Read more",
      destinations: ["/post/a", "/post/b", "/post/c"],
      contexts: [
        "Posted in News. Share this article. 3 min read.",
        "Posted in News. Share this article. 3 min read.",
        "Posted in News. Share this article. 3 min read.",
      ],
    }),
    gold: "ambiguous-repeated-links",
    notes:
      "Context is PRESENT but identical boilerplate across every link, so it disambiguates nothing. A prompt that treats 'any non-empty context = ok' would be fooled; the cues must actually differ.",
  },
  {
    id: "adv-next-not-sequential",
    context: "marketing",
    input: group({
      linkText: "Next",
      destinations: ["/onboarding/connect-bank", "/checkout/shipping", "/survey/q2"],
      contexts: ["", "", ""],
    }),
    gold: "ambiguous-repeated-links",
    notes:
      "'Next' here is NOT a sequential pager — three unrelated flows (onboarding, checkout, survey) each reuse a bare 'Next' to different destinations with no context. The Next/Previous exception assumes one sequence; reused across distinct flows it is genuinely ambiguous.",
  },
  {
    id: "adv-number-not-pagination",
    context: "ecommerce",
    input: group({
      linkText: "5",
      destinations: ["/p/blender/reviews", "/p/toaster/reviews", "/p/kettle/reviews"],
      contexts: ["", "", ""],
    }),
    gold: "ambiguous-repeated-links",
    notes:
      "A bare numeral '5' that is a star-rating link, NOT a page number — it points to three different products' reviews with no context. The 'numbers are pagination' exception must not blanket-excuse every numeric link.",
  },
  {
    id: "adv-specific-looking-but-generic",
    context: "marketing",
    input: group({
      linkText: "Read the full story",
      destinations: ["/stories/1", "/stories/2", "/stories/3"],
      contexts: ["", "", ""],
    }),
    gold: "ambiguous-repeated-links",
    notes:
      "Longer/'specific-sounding' phrase ('Read the full story') still carries zero per-story information and contexts are empty — verbosity is not specificity. Should be flagged like a bare 'Read more'.",
  },
];
