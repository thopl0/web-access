# Design system contract

Read this before building any page. Consume these components — do NOT invent new
colors, shadows, or border styles. Everything is typed and already builds.

## Product (source of truth for copy)

An embeddable tool that scans a website the way real assistive technology does,
flags what's blocking people from using it, and gives plain-language, specific
instructions to fix each issue. Audience: developers, small teams, agencies — a
smart non-specialist who doesn't know WCAG deeply. The site itself is proof the
product works: it must be one of the most accessible sites the reader has used.

Product name is a placeholder. NEVER hardcode it — import `SITE_NAME` from
`@/lib/site`. Same file exports `SITE_TAGLINE`, `SITE_DESCRIPTION`, `NAV_LINKS`,
`FOOTER_LINKS`, `CTA`.

## Tokens (Tailwind v4 utilities — already defined in app/globals.css)

Colors (use as `bg-*` / `text-*` / `border-*`):

- `bg`, `fg`, `fg-soft` (muted text), `surface` (card bg), `line` (borders) — these
  FLIP automatically in dark mode. Use them for neutral surfaces/text.
- `link` — inline link color on paper.
- Accent blocks (FIXED in both modes): `yellow`, `pink`, `blue`, `green`.
  Text colors on accents are fixed: ink (`text-[var(--ink)]`) on yellow/pink,
  `text-on-accent` (white) on blue/green. The components below already handle this.
- `ink` = the fixed dark color; used via `var(--ink)` for borders/text on accents.

Every text/bg pair is WCAG 2.2 AA verified by `scripts/contrast.mjs`. If you need
a new pairing, add it there and run `node scripts/contrast.mjs` — it must pass.

Borders: `border-[3px] border-[var(--color-line)]` for neutral, or use the
`.brut` / `.brut-card` classes. Hard shadows: `shadow-brut`, `shadow-brut-lg`, or
`.shadow-ink` (fixed-dark shadow, for accent blocks). No blur, no border-radius.
Tactile press: add class `brut-press`.

Fonts: headings use `font-display` (Space Grotesk), body is default (Inter). h1–h4
already get the display font globally.

## Components (import paths)

- `@/components/ui/Section` → `Section`, `Container`, `SectionHeading`
  - `<Section ariaLabelledby="x-title">…</Section>` wraps a semantic `<section>` with
    vertical rhythm + centered container. Use `as="div"` / `ariaLabel` as needed.
  - `<SectionHeading id="x-title" eyebrow="…" title="…" lead="…" level={2} />`
    Always wire `Section.ariaLabelledby` to the heading `id`.
- `@/components/ui/Button` → `Button`
  - Props: `variant` = `yellow|pink|blue|green|outline` (default yellow),
    `size` = `sm|md|lg`. Pass `href` to render a Next `<Link>`, else it's a `<button>`.
    44px min height + tactile press built in.
- `@/components/ui/Card` → `Card`
  - Props: `tone` = `surface|yellow|pink|blue|green`, `interactive` (press effect).
- `@/components/ui/Badge` → `Badge` — small chunky label; `tone` like Card.
- `@/components/ui/Illustration` → `Frame`, `Illustration`, `IllustrationPlaceholder`
  - `Illustration` framed image; pass `decorative` for aria-hidden empty-alt, or a
    real `alt` for meaningful art. `src` is a /public path.
  - Use `IllustrationPlaceholder` where no asset exists yet (don't fake art).
- `@/components/ui/Field` → `TextField`, `TextAreaField` — accessible form controls
  with label, required/optional marker, hint, `aria-invalid`, `aria-describedby`,
  `role="alert"` errors. (Contact page only.)
- `@/components/motion/Reveal` → `Reveal` — scroll reveal. Props: `direction`
  (`up|down|left|right|none`), `delay`, `as` (`div|section|li|span`). Wrap content
  you want to animate in on scroll. Reduced-motion safe (renders in place).
- `@/components/motion/Parallax` → `Parallax` — light layered drift; `speed` px.
  Reduced-motion safe.

Nav + Footer are in the root layout already — do not add them per page.

## Theme-aware text colors (avoid the dark-mode contrast trap)

Backgrounds fall into two kinds, and text color must match the kind:

- **Neutral grounds** (`bg-bg`, `bg-surface`, inherited page bg) FLIP in dark
  mode → text MUST use the flipping tokens `text-fg` / `text-fg-soft` / `text-link`.
- **Accent grounds** (`bg-yellow`, `bg-pink`, `bg-blue`, `bg-green`) are FIXED in
  both modes → text MUST use the fixed colors: `text-[var(--ink)]` on yellow/pink,
  `text-on-accent` (white) on blue/green. NEVER `text-fg` on an accent ground
  (it's dark-on-blue in light mode and white-on-yellow in dark mode).

NEVER put two text-color utilities on one element (e.g. a base `text-fg` plus a
conditional `text-[var(--ink)]`). The cascade — not your className order — picks
the winner, and the flipping token wins, breaking dark mode. Make text color
mutually exclusive via a ternary so exactly one class applies. `Card`/`Badge`/
`Button` already do this per `tone`/`variant`; the risk is text you place inside
an accent `<Card>`.

Audit it for real: with the dev server running, drive Chromium + axe-core over
every route in BOTH color schemes (`page.emulateMedia({ colorScheme })`). The
engine package has Playwright + axe-core already — that's the product's own
toolchain. 0 `color-contrast` violations in light AND dark is the bar.

## Accessibility rules (non-negotiable — verify, don't assume)

- One `<h1>` per page; logical heading order; no skipped levels.
- Every `<section>` that has a heading gets `aria-labelledby` pointing to it.
- Decorative illustrations: `decorative` (aria-hidden, empty alt). Meaningful ones
  get a real `alt`/accessible name.
- All interactive elements keyboard operable, 44px min target, visible focus (the
  global focus ring handles this — don't remove outlines).
- Don't gate meaning behind animation or scroll. Content must be present without JS
  motion.
- Respect the reduced-motion + dark-mode behavior already wired globally.

## Copy voice (write like a human, never AI/press-release)

Friendly, plain-spoken, confident, a little personality. Write to one person as
"you". Vary sentence length; fragments are fine. Be concrete with real scenarios.
BANNED words/phrases: unlock, elevate, seamless, robust, leverage, game-changer,
dive in, navigate the landscape, "in today's fast-paced world", "it's not just…
it's…", "whether you're a… or a…", reflexive rule-of-three lists, empower,
supercharge, effortless, cutting-edge, revolutionize. No filler (very, really,
simply, just). Re-read and rewrite anything that smells like AI.

## Page conventions

- Export `export const metadata = { title, description }` from each page (the title
  template appends `· {SITE_NAME}` automatically — pass just the page name).
- Start the page with a hero/heading section; the page's `<h1>` lives there.
- Use `Section` for each band; alternate neutral and accent grounds for rhythm.
