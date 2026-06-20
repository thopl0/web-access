/**
 * Labeled eval corpus for the TEXT link-purpose judge (`judgeLinkPurpose`, GLM). Each case is a
 * `LinkPurposeCandidate` exactly as `collectLinks` would yield it, plus the gold label a human
 * assigned and the rationale for it. This is the regression-guard data the plan (§6/§8.4) requires
 * before the AI tier is trusted: re-running it on every prompt/model change catches a quietly-worse
 * judge.
 *
 * Coverage is intentional, not random: every way the check fires (generic phrase / bare URL with no
 * disambiguating context → "link-purpose-unclear") AND a large set of `ok` negatives — ESPECIALLY the
 * *hard* negatives the prompt is told NOT to flag: a generic phrase that nearby context (heading, card
 * text, list) disambiguates, a real descriptive name, and an aria-label that supplies the purpose.
 * Precision is the headline target (≥0.85), so the corpus is weighted toward catching false
 * positives — the failure that erodes user trust fastest.
 *
 * Gold-labeling caveat (plan §6): a single author labeled these clear, defensible cases. The plan
 * calls for 2–3 expert labelers + inter-rater agreement before treating absolute numbers as ground
 * truth; until then this guards against *regressions* (relative drift), which is its job here.
 */
import type { LinkPurposeCandidate } from "../../linkPurpose";
import type { EvalCase } from "../types";

/** Build a full `LinkPurposeCandidate` from the few fields a case cares about; rest get inert defaults. */
function link(over: Partial<LinkPurposeCandidate> & { linkText: string }): LinkPurposeCandidate {
  return {
    selector: "a",
    href: "/",
    context: "",
    ariaLabel: "",
    inListOrNav: false,
    ...over,
  };
}

type LinkCase = EvalCase<LinkPurposeCandidate>;

export const LINK_PURPOSE_CORPUS: LinkCase[] = [
  // ── unclear purpose → "link-purpose-unclear" (positives) ──────────────────────────────────────
  {
    id: "unclear-click-here",
    context: "marketing",
    input: link({
      linkText: "click here",
      href: "/signup",
      context: "Ready to get started? click here to begin.",
    }),
    gold: "link-purpose-unclear",
    notes: '"click here" with context that still never names the destination.',
  },
  {
    id: "unclear-read-more-no-context",
    context: "blog",
    input: link({ linkText: "read more", href: "/post/14", context: "read more" }),
    gold: "link-purpose-unclear",
    notes: 'Bare "read more" with no surrounding text naming the article it leads to.',
  },
  {
    id: "unclear-learn-more-bare",
    context: "marketing",
    input: link({ linkText: "learn more", href: "/x", context: "learn more" }),
    gold: "link-purpose-unclear",
    notes: '"learn more" alone — nothing says learn more about what.',
  },
  {
    id: "unclear-more",
    context: "blog",
    input: link({ linkText: "more", href: "/archive", context: "more", inListOrNav: false }),
    gold: "link-purpose-unclear",
    notes: 'Bare "more" — destination unknown.',
  },
  {
    id: "unclear-here",
    context: "docs",
    input: link({
      linkText: "here",
      href: "/download",
      context: "To install the CLI, see here.",
    }),
    gold: "link-purpose-unclear",
    notes: '"here" — the sentence is about install but the link target is not named.',
  },
  {
    id: "unclear-this",
    context: "blog",
    input: link({ linkText: "this", href: "/ref", context: "We discussed this earlier." }),
    gold: "link-purpose-unclear",
    notes: '"this" — referent is vague and destination is unclear.',
  },
  {
    id: "unclear-details",
    context: "ecommerce",
    input: link({ linkText: "details", href: "/p/991", context: "details", inListOrNav: false }),
    gold: "link-purpose-unclear",
    notes: 'Bare "details" — details of what is not named.',
  },
  {
    id: "unclear-link-word",
    context: "docs",
    input: link({ linkText: "link", href: "/spec", context: "See the link." }),
    gold: "link-purpose-unclear",
    notes: 'The word "link" as the link text conveys nothing.',
  },
  {
    id: "unclear-bare-url",
    context: "blog",
    input: link({
      linkText: "https://example.com/a/b/c?ref=42",
      href: "https://example.com/a/b/c?ref=42",
      context: "https://example.com/a/b/c?ref=42",
    }),
    gold: "link-purpose-unclear",
    notes: "A bare opaque URL as the announced name with no naming context — unreadable aloud.",
  },
  {
    id: "unclear-read-more-list-ambiguous",
    context: "blog",
    input: link({
      linkText: "Read more",
      href: "/p/2",
      context: "Read more",
      inListOrNav: true,
    }),
    gold: "link-purpose-unclear",
    notes: "In a list but the item text is only the bare phrase — siblings don't disambiguate it.",
  },

  // ── ok: context disambiguates a generic phrase (HARD negatives — must NOT flag) ───────────────
  {
    id: "ok-read-more-under-heading",
    context: "blog",
    input: link({
      linkText: "Read more",
      href: "/posts/sourdough",
      context: "heading: How to bake sourdough at home — A beginner-friendly guide to your first loaf. Read more",
    }),
    gold: "ok",
    notes: "Generic phrase, but the nearest heading names the article — context makes it clear.",
  },
  {
    id: "ok-read-more-card-text",
    context: "marketing",
    input: link({
      linkText: "Learn more",
      href: "/pricing",
      context:
        "heading: Simple, transparent pricing — Pick a plan that scales with your team. Learn more",
    }),
    gold: "ok",
    notes: "Card heading + body name the pricing destination; the phrase is disambiguated.",
  },
  {
    id: "ok-here-named-in-sentence",
    context: "docs",
    input: link({
      linkText: "here",
      href: "/docs/install",
      context: "Full installation instructions for macOS and Windows are documented here.",
    }),
    gold: "ok",
    notes: 'The enclosing sentence names exactly what "here" leads to (installation instructions).',
  },
  {
    id: "ok-more-in-named-list",
    context: "ecommerce",
    input: link({
      linkText: "more",
      href: "/category/boots",
      context: "heading: Women's winter boots — Showing 12 of 48 results. more",
      inListOrNav: true,
    }),
    gold: "ok",
    notes: "List heading names the category, so 'more' clearly means more boots.",
  },

  // ── ok: genuinely descriptive accessible name (negatives) ─────────────────────────────────────
  {
    id: "ok-descriptive-pricing",
    context: "marketing",
    input: link({ linkText: "View 2024 pricing", href: "/pricing", context: "View 2024 pricing" }),
    gold: "ok",
    notes: "Accessible name fully names the destination on its own.",
  },
  {
    id: "ok-descriptive-download",
    context: "app-ui",
    input: link({
      linkText: "Download the annual report (PDF)",
      href: "/report.pdf",
      context: "Download the annual report (PDF)",
    }),
    gold: "ok",
    notes: "Descriptive name including format — destination is clear.",
  },
  {
    id: "ok-contact-nav",
    context: "marketing",
    input: link({
      linkText: "Contact sales",
      href: "/contact",
      context: "Contact sales",
      inListOrNav: true,
    }),
    gold: "ok",
    notes: "Short but specific nav label — purpose is clear.",
  },

  // ── ok: aria-label supplies the purpose (HARD negative — judge the aria-label) ────────────────
  {
    id: "ok-arialabel-supplies-purpose",
    context: "blog",
    input: link({
      linkText: "Read more",
      href: "/pricing",
      ariaLabel: "Read more about pricing",
      context: "Read more",
    }),
    gold: "ok",
    notes: "Visible text is generic, but the aria-label names the destination — that's what's announced.",
  },
  {
    id: "ok-arialabel-on-icon",
    context: "forms",
    input: link({
      linkText: "Edit your shipping address",
      href: "/account/address",
      ariaLabel: "Edit your shipping address",
      context: "Edit your shipping address",
      inListOrNav: false,
    }),
    gold: "ok",
    notes: "aria-label gives a full, specific purpose.",
  },
  {
    id: "ok-friendly-domain-name",
    context: "marketing",
    input: link({
      linkText: "example.com",
      href: "https://example.com",
      context: "Visit our partner site example.com for more.",
    }),
    gold: "ok",
    notes: "A short readable domain naming the site is an acceptable, announceable link name.",
  },

  // ── ADVERSARIAL hard negatives: must NOT flag (false-positive traps) ───────────────────────────
  {
    id: "adv-readable-slug-url",
    context: "blog",
    input: link({
      linkText: "https://example.com/blog/2024-annual-accessibility-report",
      href: "https://example.com/blog/2024-annual-accessibility-report",
      context: "https://example.com/blog/2024-annual-accessibility-report",
    }),
    gold: "ok",
    notes:
      "Trips the url-like pre-filter, but the human-readable slug fully names the destination when read aloud — a naive 'all bare URLs are bad' prompt would wrongly flag it.",
  },
  {
    id: "adv-go-brand-name",
    context: "docs",
    input: link({
      linkText: "Go",
      href: "https://go.dev",
      context:
        "heading: Backend language — Our services are written in Go, the language by Google. Go",
    }),
    gold: "ok",
    notes:
      "'Go' passes the short-name pre-filter and reads like the generic verb, but here it is a proper-noun product name the context confirms — flagging it would be a false positive.",
  },
  {
    id: "adv-download-named-in-sentence",
    context: "docs",
    input: link({
      linkText: "Download",
      href: "/installer.dmg",
      context:
        "heading: macOS installer — The latest signed macOS installer (v3.2, 84 MB) is available to Download.",
    }),
    gold: "ok",
    notes:
      "Bare 'Download' verb, but the enclosing sentence + heading name exactly what is downloaded (the macOS installer). Context disambiguates; do not flag.",
  },
  {
    id: "adv-next-named-series-context",
    context: "blog",
    input: link({
      linkText: "Next",
      href: "/series/rust-part-3",
      context:
        "heading: Learning Rust, Part 2 — Up next: Part 3, Ownership and Borrowing. Next",
      inListOrNav: true,
    }),
    gold: "ok",
    notes:
      "Pagination 'Next' whose surrounding text names the specific next article (Part 3, Ownership and Borrowing). The destination is clear from context.",
  },
  {
    id: "adv-continue-checkout-context",
    context: "ecommerce",
    input: link({
      linkText: "Continue",
      href: "/checkout/shipping",
      context: "heading: Step 2 of 4: Shipping — Continue to payment",
    }),
    gold: "ok",
    notes:
      "'Continue' alone is generic, but the surrounding text 'Continue to payment' under a numbered checkout step names the destination step.",
  },
  {
    id: "adv-arialabel-disambiguates-scary-href",
    context: "ecommerce",
    input: link({
      linkText: "View",
      href: "/p?id=8841&utm=feed&sess=x7",
      ariaLabel: "View product details for the Acme wireless keyboard",
      context: "View",
      inListOrNav: true,
    }),
    gold: "ok",
    notes:
      "Visible text and href are both opaque, but the aria-label fully names the purpose — the prompt must judge the announced name (aria-label), not the messy href.",
  },
  {
    id: "adv-here-clause-after-link",
    context: "docs",
    input: link({
      linkText: "here",
      href: "/security/disclosure",
      context:
        "Report a vulnerability through our coordinated disclosure process here, which explains scope and timelines.",
    }),
    gold: "ok",
    notes:
      "'here' is generic but the same sentence names the destination (the coordinated disclosure process); a prompt that flags every 'here' regardless of context would misfire.",
  },
  {
    id: "adv-view-figcaption-context",
    context: "ecommerce",
    input: link({
      linkText: "details",
      href: "/p/501",
      context:
        "Patagonia Nano Puff jacket, men's, slate blue — $199. See full details.",
    }),
    gold: "ok",
    notes:
      "Product card text names the specific item directly before the 'details' link, so the destination (this jacket's details) is clear in context.",
  },

  // ── ADVERSARIAL positives: must still flag (false-negative traps) ─────────────────────────────
  {
    id: "adv-arialabel-also-generic",
    context: "marketing",
    input: link({
      linkText: "Read more",
      href: "/p/9",
      ariaLabel: "click here",
      context: "Read more",
    }),
    gold: "link-purpose-unclear",
    notes:
      "The aria-label is the announced name but it is ALSO generic ('click here') — judging the aria-label correctly still yields an unclear purpose; a prompt that assumes any aria-label saves the link would miss this.",
  },
  {
    id: "adv-heading-doesnt-name-this-link",
    context: "blog",
    input: link({
      linkText: "Read more",
      href: "/p/17",
      context: "heading: Related articles — Read more",
      inListOrNav: true,
    }),
    gold: "link-purpose-unclear",
    notes:
      "A heading IS present, but 'Related articles' is itself generic and does not name THIS link's destination — context that exists but doesn't disambiguate must not be treated as a free pass.",
  },
  {
    id: "adv-opaque-shortener-url",
    context: "blog",
    input: link({
      linkText: "bit.ly/3xKp2Qr",
      href: "https://bit.ly/3xKp2Qr",
      context: "For the full study, see bit.ly/3xKp2Qr.",
    }),
    gold: "link-purpose-unclear",
    notes:
      "Looks domain-readable (passes url-like filter) but the shortener slug names nothing, and 'For the full study, see ___' is a generic frame; read aloud it is opaque. Must flag despite the surrounding sentence.",
  },
  {
    id: "adv-learn-more-empty-cta",
    context: "marketing",
    input: link({
      linkText: "Learn more",
      href: "/x",
      context: "heading: Ready to grow your business? — Take the next step today. Learn more",
    }),
    gold: "link-purpose-unclear",
    notes:
      "Context exists and looks supportive, but the heading/body are pure motivational CTA copy that never names a destination — a prompt fooled by the mere PRESENCE of a heading would wrongly pass this.",
  },
];
