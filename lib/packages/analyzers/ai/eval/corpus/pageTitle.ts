/**
 * Labeled eval corpus for the TEXT page-title-quality judge (`judgePageTitle`, GLM). Each case is a
 * `PageTitleCandidate` exactly as `collectPageTitle` would yield it, plus the gold label a human
 * assigned and the rationale for it. This is the regression-guard data the plan (§6/§8.4) requires
 * BEFORE the AI tier is trusted: re-running it on every prompt/model change is how a quietly-worse
 * judge gets caught.
 *
 * Coverage is intentional, not random: every way the check fires (default/scaffold titles, a bare
 * brand name with no page context, a single generic word) AND a large set of `ok` negatives —
 * ESPECIALLY the hard negatives the prompt is told NOT to flag (a real descriptor that contains the
 * brand; a short-but-descriptive title; "Home" on a genuine home page). Precision is the headline
 * target (≥0.85), so the corpus is weighted toward catching false positives, the failure that erodes
 * user trust fastest.
 *
 * Gold-labeling caveat (plan §6): a single author labeled these. They're the clear, defensible cases;
 * the plan calls for 2–3 expert labelers + inter-rater agreement before treating absolute numbers as
 * ground truth. Until then this guards against *regressions* (relative drift), which is its job here.
 */
import type { PageTitleCandidate } from "../../pageTitle";
import type { EvalCase } from "../types";

/** Build a full `PageTitleCandidate` from the few fields a case cares about; the rest get inert defaults. */
function title(over: Partial<PageTitleCandidate> & { title: string }): PageTitleCandidate {
  return {
    selector: "title",
    h1: "",
    url: "https://example.com/",
    metaDescription: "",
    ...over,
  };
}

type TitleCase = EvalCase<PageTitleCandidate>;

export const PAGE_TITLE_CORPUS: TitleCase[] = [
  // ── default / scaffold titles → "page-title-uninformative" ───────────────────────────────────
  {
    id: "tpl-document",
    context: "marketing",
    input: title({ title: "Document", h1: "Acme — All-in-one invoicing", url: "https://acme.io/" }),
    gold: "page-title-uninformative",
    notes: 'Default "Document" title the author never replaced; the h1 shows the page has real content.',
  },
  {
    id: "tpl-react-app",
    context: "app-ui",
    input: title({ title: "React App", h1: "Your dashboard", url: "https://app.acme.io/dashboard" }),
    gold: "page-title-uninformative",
    notes: 'Create React App default title left in production.',
  },
  {
    id: "tpl-vite-react",
    context: "app-ui",
    input: title({ title: "Vite + React", h1: "Task board", url: "https://tasks.example.com/" }),
    gold: "page-title-uninformative",
    notes: "Vite scaffold default — describes the toolchain, not the page.",
  },
  {
    id: "tpl-create-next",
    context: "marketing",
    input: title({ title: "Create Next App", h1: "Plans & pricing", url: "https://example.com/pricing" }),
    gold: "page-title-uninformative",
    notes: "Next.js scaffold default on a real pricing page.",
  },
  {
    id: "tpl-webflow",
    context: "marketing",
    input: title({ title: "Webflow Site", h1: "Our services", url: "https://studio.example.com/services" }),
    gold: "page-title-uninformative",
    notes: "Webflow export default title never customised.",
  },
  {
    id: "tpl-untitled",
    context: "blog",
    input: title({ title: "Untitled", h1: "How we cut build times in half", url: "https://blog.example.com/build-times" }),
    gold: "page-title-uninformative",
    notes: '"Untitled" describes nothing; the h1 is a real article headline.',
  },
  {
    id: "tpl-index",
    context: "docs",
    input: title({ title: "index", h1: "Getting started", url: "https://docs.example.com/getting-started" }),
    gold: "page-title-uninformative",
    notes: 'Raw filename "index" leaked as the title.',
  },

  // ── single generic word → "page-title-uninformative" ─────────────────────────────────────────
  {
    id: "generic-page",
    context: "marketing",
    input: title({ title: "Page", h1: "Customer stories", url: "https://example.com/customers" }),
    gold: "page-title-uninformative",
    notes: 'Generic word "Page" names no topic.',
  },
  {
    id: "generic-welcome",
    context: "marketing",
    input: title({ title: "Welcome", h1: "Enterprise security features", url: "https://example.com/security" }),
    gold: "page-title-uninformative",
    notes: '"Welcome" on a specific security page tells the user nothing about it.',
  },

  // ── bare brand name on a specific (non-home) page → "page-title-uninformative" ────────────────
  {
    id: "bare-brand-pricing",
    context: "marketing",
    input: title({ title: "Acme", h1: "Pricing", url: "https://acme.io/pricing", metaDescription: "Simple per-seat pricing for teams of any size." }),
    gold: "page-title-uninformative",
    notes: "Bare brand name on a pricing page — no page context; the h1/URL show it's not the home page.",
  },
  {
    id: "bare-brand-docs",
    context: "docs",
    input: title({ title: "Northwind", h1: "Authentication API reference", url: "https://docs.northwind.dev/api/auth" }),
    gold: "page-title-uninformative",
    notes: "Brand alone on a deep docs page; identical title across every page can't identify this one.",
  },
  {
    id: "bare-brand-product",
    context: "ecommerce",
    input: title({ title: "Lumen Store", h1: "Aurora desk lamp — walnut", url: "https://lumen.shop/products/aurora-walnut" }),
    gold: "page-title-uninformative",
    notes: "Store name alone on a specific product page — the product is invisible in tab/search results.",
  },

  // ── good titles → "ok" (true negatives) ──────────────────────────────────────────────────────
  {
    id: "ok-pricing-brand",
    context: "marketing",
    input: title({ title: "Pricing — Acme", h1: "Pricing", url: "https://acme.io/pricing" }),
    gold: "ok",
    notes: "Real descriptor + brand — exactly the recommended pattern; must NOT flag for containing the brand.",
  },
  {
    id: "ok-docs-howto",
    context: "docs",
    input: title({ title: "How to install the SDK | Docs", h1: "Install the SDK", url: "https://docs.example.com/install" }),
    gold: "ok",
    notes: "Specific, descriptive title — clearly identifies the page.",
  },
  {
    id: "ok-brand-then-descriptor",
    context: "ecommerce",
    input: title({ title: "Lumen Store — Aurora desk lamp", h1: "Aurora desk lamp — walnut", url: "https://lumen.shop/products/aurora-walnut" }),
    gold: "ok",
    notes: "Brand FOLLOWED by a real product descriptor — the brand being present is good, not a problem.",
  },
  {
    id: "ok-short-contact",
    context: "marketing",
    input: title({ title: "Contact us", h1: "Contact us", url: "https://example.com/contact" }),
    gold: "ok",
    notes: "Short but genuinely descriptive — names the page's purpose. Must not flag just for being short.",
  },
  {
    id: "ok-home-on-homepage",
    context: "marketing",
    input: title({ title: "Home", h1: "Welcome to Acme", url: "https://acme.io/", metaDescription: "Acme is invoicing for small teams." }),
    gold: "ok",
    notes: 'Hard negative: "Home" on the genuine root/home page (URL is root, h1 is a welcome line) is acceptable.',
  },
  {
    id: "ok-blog-post-title",
    context: "blog",
    input: title({ title: "Cutting our build times in half — Engineering Blog", h1: "Cutting our build times in half", url: "https://blog.example.com/build-times" }),
    gold: "ok",
    notes: "Descriptive article title plus section name — fully identifies the page.",
  },
  {
    id: "ok-form-checkout",
    context: "forms",
    input: title({ title: "Checkout — Lumen Store", h1: "Checkout", url: "https://lumen.shop/checkout" }),
    gold: "ok",
    notes: "Names the step (checkout) plus the brand — clear and correct.",
  },
  {
    id: "ok-brand-tagline",
    context: "marketing",
    input: title({ title: "Acme — Invoicing for small teams", h1: "Invoicing that pays you faster", url: "https://acme.io/" }),
    gold: "ok",
    notes: "Home page: brand plus a descriptive tagline — identifies the site/page well.",
  },
  {
    id: "ok-app-named-view",
    context: "app-ui",
    input: title({ title: "Inbox · Acme Mail", h1: "Inbox", url: "https://mail.acme.io/inbox" }),
    gold: "ok",
    notes: "Names the specific view (Inbox) plus the product — not a bare brand.",
  },
  {
    id: "ok-ecom-category",
    context: "ecommerce",
    input: title({ title: "Desk lamps | Lumen Store", h1: "Desk lamps", url: "https://lumen.shop/c/desk-lamps" }),
    gold: "ok",
    notes: "Category name plus brand — describes the listing page.",
  },

  // ── ADVERSARIAL: hard-negative "ok" traps a naive prompt would wrongly FLAG ───────────────────
  {
    id: "adv-brand-is-the-page",
    context: "marketing",
    input: title({ title: "Jane Okafor", h1: "Jane Okafor", url: "https://janeokafor.dev/", metaDescription: "Personal site & portfolio of Jane Okafor, staff engineer." }),
    gold: "ok",
    notes: 'Personal-portfolio home page: the person\'s name IS the page subject (h1 matches, URL is root). Looks like a "bare brand name" but is genuinely descriptive — must NOT flag.',
  },
  {
    id: "adv-bare-brand-no-evidence",
    context: "marketing",
    input: title({ title: "Northwind", h1: "", url: "https://northwind.dev/", metaDescription: "" }),
    gold: "ok",
    notes: 'Bare brand, but NO evidence it is a non-home page: URL is root, no h1, no description. Prompt says default to ok under doubt — flagging this is a false positive. Contrast bare-brand-docs (deep URL + topical h1).',
  },
  {
    id: "adv-section-word-descriptive",
    context: "blog",
    input: title({ title: "Blog", h1: "", url: "https://acme.io/blog", metaDescription: "Engineering and product updates from the Acme team." }),
    gold: "ok",
    notes: '"Blog" reads like a single generic word, but on /blog it correctly names the section it labels. The URL + description confirm the topic — a defensible descriptor, not a generic non-answer.',
  },
  {
    id: "adv-faq-short",
    context: "marketing",
    input: title({ title: "FAQ", h1: "Frequently asked questions", url: "https://acme.io/faq" }),
    gold: "ok",
    notes: "Very short and could pre-filter as suspicious, but FAQ is a precise, conventional page identity (h1/URL agree). Must not be flagged for brevity.",
  },
  {
    id: "adv-404-page",
    context: "marketing",
    input: title({ title: "Page not found — Acme", h1: "404", url: "https://acme.io/no-such-thing" }),
    gold: "ok",
    notes: 'Contains "Page" (a TEMPLATE_TITLES word) and the h1 is a bare "404", but the title accurately describes an error page. A naive keyword match on "page" would misfire.',
  },
  {
    id: "adv-localized-descriptor",
    context: "ecommerce",
    input: title({ title: "Precios — Acme", h1: "Precios", url: "https://acme.io/es/precios", metaDescription: "Precios por usuario para equipos de cualquier tamaño." }),
    gold: "ok",
    notes: 'Spanish-language descriptor ("Precios" = Pricing) + brand. A model anchored on English keywords might not recognise it as descriptive and over-flag — it is the recommended descriptor+brand pattern.',
  },
  {
    id: "adv-home-welcome-word",
    context: "marketing",
    input: title({ title: "Welcome", h1: "Welcome to Northwind", url: "https://northwind.dev/", metaDescription: "Northwind: logistics software for distributors." }),
    gold: "ok",
    notes: 'Hard negative: "Welcome" is in TEMPLATE_TITLES and is flagged on a specific page (see generic-welcome), but here the URL is root and the h1 is a genuine welcome line — an acceptable home-page title. Mirror image of generic-welcome to pin the home-vs-inner distinction.',
  },
  {
    id: "adv-numeric-product-model",
    context: "ecommerce",
    input: title({ title: "X230", h1: "ThinkPad X230", url: "https://refurb.shop/p/x230" }),
    gold: "ok",
    notes: "A terse model number reads as cryptic/generic, but the h1 + product URL show it is the specific product's identity. Not a scaffold or bare-brand case — defaulting to flag would be a false positive.",
  },

  // ── ADVERSARIAL: sneaky true-positives a naive prompt would wrongly PASS ──────────────────────
  {
    id: "adv-scaffold-plus-brand",
    context: "app-ui",
    input: title({ title: "React App — Acme", h1: "Billing settings", url: "https://app.acme.io/settings/billing" }),
    gold: "page-title-uninformative",
    notes: 'Scaffold default with the brand appended. The prompt praises "brand present", so a naive read passes it — but "React App" is still pure boilerplate that names the toolchain, not the page; the brand suffix does not rescue it.',
  },
  {
    id: "adv-stale-mismatched-title",
    context: "marketing",
    input: title({ title: "Acme", h1: "Open roles at Acme", url: "https://acme.io/careers", metaDescription: "We're hiring across engineering, sales, and support." }),
    gold: "page-title-uninformative",
    notes: "Bare brand on the careers page — h1/URL/description all say this is a specific non-home page, so the lone brand fails to identify it. The supporting evidence is the tell; ignoring it would be a false negative.",
  },
  {
    id: "adv-generic-with-brand-suffix",
    context: "ecommerce",
    input: title({ title: "Home | Lumen Store", h1: "Aurora desk lamp — walnut", url: "https://lumen.shop/products/aurora-walnut" }),
    gold: "page-title-uninformative",
    notes: '"Home" appended with the brand, but the URL/h1 prove this is a specific PRODUCT page, not the home page. The brand suffix masks a wrong, generic title — must still flag.',
  },
  {
    id: "adv-localized-scaffold",
    context: "blog",
    input: title({ title: "Página nueva", h1: "Cómo reducimos a la mitad los tiempos de compilación", url: "https://blog.example.com/es/build-times" }),
    gold: "page-title-uninformative",
    notes: 'Spanish CMS default ("Página nueva" = "New page"), not in the English TEMPLATE_TITLES set. The real article headline is in the h1 — a non-English scaffold leak the judge should still catch.',
  },
];
