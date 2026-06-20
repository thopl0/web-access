/**
 * Labeled eval corpus for the TEXT heading-quality judge (`judgeHeadingQuality`, GLM). Each case is a
 * `HeadingQualityCandidate` exactly as `collectHeadings` would yield it, plus the gold label a human
 * assigned and the rationale for it. This is the regression-guard data the plan (§6/§8.4) requires
 * BEFORE the AI tier is trusted: re-running it on every prompt/model change is how a quietly-worse
 * judge gets caught.
 *
 * Coverage is intentional, not random: every way the check fires (vague/placeholder/boilerplate
 * headings → "heading-uninformative") AND a large set of `ok` negatives — especially the *hard*
 * negatives the prompt is told NOT to flag (short-but-descriptive section labels like "Pricing"/
 * "FAQ", proper nouns / product names, genuine "Welcome"/"Overview" intros). Precision is the
 * headline target (≥0.85), so the corpus is weighted toward catching false positives, the failure
 * that erodes user trust fastest.
 *
 * Gold-labeling caveat (plan §6): a single author labeled these. They're the clear, defensible cases;
 * the plan calls for 2–3 expert labelers + inter-rater agreement before treating absolute numbers as
 * ground truth. Until then this guards against *regressions* (relative drift), which is its job here.
 */
import type { HeadingQualityCandidate } from "../../headingQuality";
import type { EvalCase } from "../types";

/** Build a full candidate from the few fields a case cares about; the rest get inert defaults. */
function heading(
  over: Partial<HeadingQualityCandidate> & { text: string; sectionPreview: string },
): HeadingQualityCandidate {
  return {
    selector: "h2",
    level: 2,
    ...over,
  };
}

type HeadingCase = EvalCase<HeadingQualityCandidate>;

export const HEADING_QUALITY_CORPUS: HeadingCase[] = [
  // ── uninformative / placeholder → "heading-uninformative" ─────────────────────────────────────
  {
    id: "vague-more",
    context: "marketing",
    input: heading({
      text: "More",
      sectionPreview:
        "Our platform integrates with Slack, Salesforce, and HubSpot, and supports single sign-on for enterprise teams.",
    }),
    gold: "heading-uninformative",
    notes: '"More" labels a real integrations section but describes nothing about it.',
  },
  {
    id: "vague-info",
    context: "ecommerce",
    input: heading({
      text: "Info",
      sectionPreview:
        "Free shipping on orders over $50. Returns accepted within 30 days. Ships from our New Jersey warehouse.",
    }),
    gold: "heading-uninformative",
    notes: '"Info" is a generic catch-all; "Shipping & returns" would actually describe it.',
  },
  {
    id: "placeholder-section-1",
    context: "docs",
    input: heading({
      text: "Section 1",
      sectionPreview:
        "Install the CLI with npm install, then run the init command to scaffold your project.",
    }),
    gold: "heading-uninformative",
    notes: 'Numbered placeholder "Section 1" — no idea it is about installation.',
  },
  {
    id: "placeholder-untitled",
    context: "blog",
    input: heading({
      text: "Untitled",
      sectionPreview:
        "I spent the weekend rebuilding my standing desk and learned more about cable management than I ever wanted to.",
    }),
    gold: "heading-uninformative",
    notes: '"Untitled" is a leftover editor placeholder describing nothing.',
  },
  {
    id: "placeholder-heading",
    context: "marketing",
    input: heading({
      text: "Heading",
      sectionPreview:
        "Join 10,000 teams that ship faster with our automated deployment pipeline and instant rollbacks.",
    }),
    gold: "heading-uninformative",
    notes: 'Literally the word "Heading" — an unfilled template field.',
  },
  {
    id: "placeholder-title",
    context: "app-ui",
    input: heading({
      text: "Title",
      sectionPreview: "Your most recent project activity and pending review requests appear here.",
    }),
    gold: "heading-uninformative",
    notes: '"Title" is a placeholder, not a label for the activity panel.',
  },
  {
    id: "placeholder-lorem",
    context: "marketing",
    input: heading({
      text: "Lorem ipsum dolor",
      sectionPreview:
        "Our consultants help mid-market manufacturers cut downtime with predictive maintenance.",
    }),
    gold: "heading-uninformative",
    notes: "Lorem-ipsum filler left in production — describes nothing.",
  },
  {
    id: "vague-click-here",
    context: "marketing",
    input: heading({
      text: "Click here",
      sectionPreview:
        "Download our 2024 benchmark report comparing response times across the top ten providers.",
    }),
    gold: "heading-uninformative",
    notes: '"Click here" is action boilerplate, not a section label.',
  },
  {
    id: "vague-welcome-on-content",
    context: "ecommerce",
    input: heading({
      text: "Welcome",
      sectionPreview:
        "Shop the new spring collection: lightweight jackets, linen shirts, and canvas sneakers now 20% off.",
    }),
    gold: "heading-uninformative",
    notes: '"Welcome" sits on a product-promo section it does not describe.',
  },
  {
    id: "vague-read-more",
    context: "blog",
    input: heading({
      text: "Read more",
      sectionPreview:
        "Three lesser-known tax deductions freelancers routinely miss, and how to claim each one.",
    }),
    gold: "heading-uninformative",
    notes: '"Read more" is a link label masquerading as a heading.',
  },
  {
    id: "vague-details",
    context: "ecommerce",
    input: heading({
      text: "Details",
      sectionPreview:
        "Cast-iron skillet, 12 inch, pre-seasoned, oven-safe to 500°F, made in the USA.",
    }),
    gold: "heading-uninformative",
    notes: '"Details" is generic; "Product specifications" would label this.',
  },
  {
    id: "vague-overview-on-pricing",
    context: "app-ui",
    input: heading({
      text: "Overview",
      sectionPreview:
        "Starter $9/mo, Pro $29/mo, Enterprise custom. All plans include unlimited projects.",
    }),
    gold: "heading-uninformative",
    notes: '"Overview" on a clearly-pricing section misleads; "Pricing" is the real label.',
  },

  // ── good headings → "ok" (true negatives) ─────────────────────────────────────────────────────
  // Hard negatives: SHORT but genuinely descriptive section labels — must NOT be flagged.
  {
    id: "ok-pricing",
    context: "marketing",
    input: heading({
      text: "Pricing",
      sectionPreview:
        "Starter $9/mo, Pro $29/mo, Enterprise custom. Annual billing saves two months.",
    }),
    gold: "ok",
    notes: "Terse but accurately names a pricing section — the canonical hard negative.",
  },
  {
    id: "ok-faq",
    context: "marketing",
    input: heading({
      text: "FAQ",
      sectionPreview:
        "Can I cancel anytime? Yes. Do you offer refunds? Within 14 days. Is there a free trial? Yes, 30 days.",
    }),
    gold: "ok",
    notes: "Standard, well-understood label for a Q&A section.",
  },
  {
    id: "ok-contact-us",
    context: "marketing",
    input: heading({
      text: "Contact us",
      sectionPreview:
        "Email support@example.com or call +1 555 0100, Monday to Friday, 9am to 5pm Eastern.",
    }),
    gold: "ok",
    notes: "Short but exactly labels the contact section.",
  },
  {
    id: "ok-our-team",
    context: "marketing",
    input: heading({
      text: "Our team",
      sectionPreview:
        "Meet the engineers, designers, and support staff who build and maintain the product.",
    }),
    gold: "ok",
    notes: "Accurately names a team/about section.",
  },
  {
    id: "ok-shipping-returns",
    context: "ecommerce",
    input: heading({
      text: "Shipping & returns",
      sectionPreview:
        "Free standard shipping over $50. Returns accepted within 30 days in original packaging.",
    }),
    gold: "ok",
    notes: "Concise and precisely describes the section.",
  },
  {
    id: "ok-reviews",
    context: "ecommerce",
    input: heading({
      text: "Customer reviews",
      sectionPreview: "4.6 out of 5 from 1,284 buyers. Most praise the build quality and battery life.",
    }),
    gold: "ok",
    notes: "Labels the reviews section accurately.",
  },
  {
    id: "ok-genuine-welcome",
    context: "app-ui",
    input: heading({
      text: "Welcome",
      sectionPreview:
        "Thanks for signing up! Let's get your account set up in three quick steps before you dive in.",
    }),
    gold: "ok",
    notes: '"Welcome" on a genuine onboarding/greeting — prompt says do NOT flag this case.',
  },
  {
    id: "ok-genuine-introduction",
    context: "docs",
    input: heading({
      text: "Introduction",
      sectionPreview:
        "This guide explains the core concepts of the API: resources, authentication, and rate limits.",
    }),
    gold: "ok",
    notes: '"Introduction" genuinely heads an intro section — descriptive, not a placeholder.',
  },
  {
    id: "ok-product-name",
    context: "ecommerce",
    input: heading({
      text: "AirPods Pro",
      sectionPreview:
        "Active noise cancellation, adaptive transparency, and up to 6 hours of listening time.",
    }),
    gold: "ok",
    notes: "Proper product name as a heading — a real, specific label, never flag.",
  },
  {
    id: "ok-person-name",
    context: "blog",
    input: heading({
      text: "Ada Lovelace",
      sectionPreview:
        "The 19th-century mathematician who wrote the first algorithm intended for a machine.",
    }),
    gold: "ok",
    notes: "A person's name correctly labels a biography section.",
  },
  {
    id: "ok-descriptive-multiword",
    context: "blog",
    input: heading({
      text: "How to season a cast-iron skillet",
      sectionPreview:
        "Coat the pan in a thin layer of oil, bake upside down at 450°F for an hour, and repeat twice.",
    }),
    gold: "ok",
    notes: "Fully descriptive multi-word heading — the easy negative.",
  },
  {
    id: "ok-feature-name",
    context: "app-ui",
    input: heading({
      text: "Single sign-on",
      sectionPreview:
        "Let your team log in with their existing Google or Okta credentials — no extra passwords.",
    }),
    gold: "ok",
    notes: "Specific feature name accurately labels its section.",
  },
  {
    id: "ok-thin-section-overview",
    context: "marketing",
    input: heading({
      text: "Overview",
      sectionPreview: "",
    }),
    gold: "ok",
    notes: "Section preview is empty — too thin to judge fairly, so default to ok (abstain).",
  },

  // ── ADVERSARIAL hard-negatives ("ok") — single/terse labels that LOOK generic but are correct ──
  // Weighted heavily: these are the precision traps a naive prompt over-flags as placeholder.
  {
    id: "adv-ok-ingredients",
    context: "ecommerce",
    input: heading({
      text: "Ingredients",
      sectionPreview:
        "Organic shea butter, cold-pressed coconut oil, beeswax, and lavender essential oil. No parabens.",
    }),
    gold: "ok",
    notes:
      "One generic-looking noun, but it precisely names an ingredients list — terse-but-accurate, must not flag.",
  },
  {
    id: "adv-ok-warranty",
    context: "ecommerce",
    input: heading({
      text: "Warranty",
      sectionPreview:
        "Covered against manufacturing defects for two years. Register within 30 days to extend to three.",
    }),
    gold: "ok",
    notes:
      'A bare "Warranty" reads like a boilerplate word but exactly labels the warranty terms below it.',
  },
  {
    id: "adv-ok-specifications",
    context: "ecommerce",
    input: heading({
      text: "Specifications",
      sectionPreview:
        "Weight 1.2kg, 14-inch display, 16GB RAM, 512GB SSD, USB-C charging, 18-hour battery.",
    }),
    gold: "ok",
    notes:
      'Adversary pair to the "Details"→uninformative case: "Specifications" genuinely names a spec table — keep ok.',
  },
  {
    id: "adv-ok-changelog",
    context: "docs",
    input: heading({
      text: "Changelog",
      sectionPreview:
        "v3.2 added dark mode and fixed the export crash. v3.1 introduced SSO. v3.0 was the rewrite.",
    }),
    gold: "ok",
    notes:
      "Single domain term that accurately labels a release-notes section; a naive prompt may mistake it for jargon-placeholder.",
  },
  {
    id: "adv-ok-section-8-proper-noun",
    context: "docs",
    input: heading({
      text: "Section 8",
      sectionPreview:
        "Section 8 of the Housing Act provides rental assistance vouchers to low-income tenants through local agencies.",
    }),
    gold: "ok",
    notes:
      'Hardest trap: "Section 8" matches the numbered-placeholder pattern, but here it is a PROPER NOUN (the housing program) the section is literally about. Must stay ok.',
  },
  {
    id: "adv-ok-model-name-more",
    context: "ecommerce",
    input: heading({
      text: "More",
      sectionPreview:
        "The Fitbit Charge 6 'More' edition adds always-on display and onboard GPS over the base model.",
    }),
    gold: "ok",
    notes:
      'Collides with the canonical "More"→uninformative case, but here "More" is a product edition name the section describes. Context disambiguates — must not flag on the word alone.',
  },
  {
    id: "adv-ok-get-started-imperative",
    context: "docs",
    input: heading({
      text: "Get started",
      sectionPreview:
        "Create a free account, install the SDK with one command, and make your first API call in under five minutes.",
    }),
    gold: "ok",
    notes:
      'Imperative phrase that, unlike "Click here", genuinely describes an onboarding/quickstart section. Naive prompt may lump it with action-boilerplate.',
  },
  {
    id: "adv-ok-how-it-works",
    context: "marketing",
    input: heading({
      text: "How it works",
      sectionPreview:
        "Connect your bank, we categorise every transaction automatically, and you get a monthly spending report.",
    }),
    gold: "ok",
    notes:
      "Common, genuinely descriptive section label for a process explanation; should not be confused with vague boilerplate.",
  },
  {
    id: "adv-ok-welcome-named-org",
    context: "marketing",
    input: heading({
      text: "Welcome to Northwind Bank",
      sectionPreview:
        "Open an account in minutes, move money with zero fees, and reach a human agent any time of day.",
    }),
    gold: "ok",
    notes:
      'Adversary to "Welcome"-on-content: this "Welcome" carries a specific brand noun and heads a genuine intro — descriptive, keep ok.',
  },
  {
    id: "adv-ok-step-1-descriptive",
    context: "docs",
    input: heading({
      text: "Step 1: Create an account",
      sectionPreview:
        "Enter your email and a password, confirm via the link we send, and you are ready to log in.",
    }),
    gold: "ok",
    notes:
      'Numbered like "Section 1" but the descriptive tail ("Create an account") makes it a fully informative heading — must not flag for the number.',
  },
  {
    id: "adv-ok-dosage-medical",
    context: "docs",
    input: heading({
      text: "Dosage",
      sectionPreview:
        "Adults: one 200mg tablet every 6 hours, not to exceed 6 tablets in 24 hours. Take with food.",
    }),
    gold: "ok",
    notes:
      "Terse single-word medical label that precisely names the dosing instructions; precision trap for a flag-the-short-word heuristic.",
  },

  // ── ADVERSARIAL true-positives ("heading-uninformative") — recall traps the prompt must still catch ──
  {
    id: "adv-tp-descriptive-mismatch",
    context: "marketing",
    input: heading({
      text: "Pricing",
      sectionPreview:
        "Meet our founders: Jane led infrastructure at a Fortune 500, and Omar built three developer tools.",
    }),
    gold: "heading-uninformative",
    notes:
      'Heading reads descriptive in isolation but MISMATCHES its section (a team bio, not pricing) — the judge must compare against the section, not just rate the word. A recall trap.',
  },
  {
    id: "adv-tp-wordy-but-empty",
    context: "blog",
    input: heading({
      text: "Some more information about this and that",
      sectionPreview:
        "We cover a few topics you might find useful depending on what you are looking for today.",
    }),
    gold: "heading-uninformative",
    notes:
      "Long enough to slip past short-heading heuristics, yet conveys nothing about the section — wordiness is not descriptiveness.",
  },
  {
    id: "adv-tp-link-sentence-heading",
    context: "marketing",
    input: heading({
      text: "Click here to learn more about everything we offer",
      sectionPreview:
        "Our managed hosting includes daily backups, DDoS protection, and 24/7 monitoring.",
    }),
    gold: "heading-uninformative",
    notes:
      'A full sentence built around "Click here"/"learn more" link-boilerplate masquerading as a descriptive heading; must still be caught despite its length.',
  },
];
