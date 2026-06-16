# frontend — marketing site

The public marketing website for the accessibility checker. It sits beside
[`../engine`](../engine), which holds the backend (the embed `<script>`,
ingest/report API, render worker, and analyzers).

The site is built to be **proof the product works**: it targets WCAG 2.2 AA
across every page and we test that rather than assume it. See
[`/accessibility`](app/accessibility/page.tsx) for the live statement.

> The product name **Inclusio** is a working placeholder. It lives in exactly
> one place — see [Swapping the placeholder name](#swapping-the-placeholder-name-copy-and-assets).

## Stack

- **Next.js 16** (App Router, TypeScript, Turbopack) + **React 19**
- **Tailwind CSS v4** — the neo-brutalist design system is built as theme tokens
  in [`app/globals.css`](app/globals.css) plus typed components, no UI kit.
- **Motion** (`motion`, the Framer Motion package) for animation.
- **Lucide** (`lucide-react`) for thick-stroke icons.
- Fonts via `next/font/google`: **Space Grotesk** (display) + **Inter** (body).

shadcn/ui is intentionally **not** used on these public pages — it would dilute
the custom look. It's fine to add later for the authenticated/app area.

## Run it

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

Other scripts:

```bash
pnpm build              # production build (Turbopack) — also typechecks
pnpm start              # serve the production build
pnpm lint               # eslint (flat config)
node scripts/contrast.mjs   # verify every palette pair against WCAG 2.2 AA
```

## Structure

```
app/
  layout.tsx            # root: fonts, metadata, skip link, Nav + Footer, MotionProvider
  globals.css           # design tokens (@theme), neo-brutalist primitives, focus ring,
                        #   reduced-motion + dark-mode, skip link
  page.tsx              # Home / landing (the main showcase)
  how-it-works/         # scan → report → fix walkthrough
  features/             # capability deep-dive
  pricing/              # Free / Pro / Business (placeholder "TBD" prices) + FAQ
  contact/              # fully accessible form (stubbed submit)
  accessibility/        # real, specific accessibility statement
  login/  signup/       # auth scaffolds (no backend yet)
  not-found.tsx         # on-brand 404
components/
  Nav.tsx  Footer.tsx   # shared chrome (auth-aware CTAs)
  ui/                   # Section, Button, Card, Badge, Field, Illustration
  motion/               # MotionProvider, Reveal, Parallax (all reduced-motion safe)
  home/ how-it-works/ features/ contact/ pricing/ auth/   # page-only helpers
lib/
  site.ts               # SITE_NAME + tagline, nav links, CTA targets  ← edit here
  utils.ts              # cn() classname joiner
scripts/
  contrast.mjs          # WCAG contrast verifier for the palette
docs/
  DESIGN_SYSTEM.md      # the component/token contract + a11y + copy rules
```

## Design system

Everything consumes one contract documented in
[`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md). The short version:

- **Tokens** (`app/globals.css`, Tailwind v4 `@theme`): neutral surfaces
  `bg / fg / fg-soft / surface / line / link` flip automatically in dark mode;
  accent blocks `yellow / pink / blue / green` are fixed in both modes with
  hard-coded text colors so contrast holds when the page inverts.
- **Look**: 3px solid borders, hard-offset shadows (no blur), zero border-radius,
  tactile press (`.brut-press`). Display font on headings, Inter for body.
- **Components**: `Section`/`SectionHeading`/`Container`, `Button`
  (`yellow|pink|blue|green|outline`, 44px min), `Card`, `Badge`, `Illustration`,
  `Field` (`TextField`/`TextAreaField`), `Reveal`, `Parallax`.

### Palette + verified contrast ratios

Every text/background pair is checked by `node scripts/contrast.mjs`, which
fails if any pair drops below target (4.5:1 text, 3.0:1 large text / UI / focus).

| Token | Hex (light) | Hex (dark) | Role |
| --- | --- | --- | --- |
| `bg` (paper) | `#FBF7F0` | `#14120D` | page background |
| `fg` | `#16140F` | `#FBF7F0` | default text |
| `fg-soft` | `#4A4640` | `#CFC9BD` | muted text |
| `surface` | `#FFFFFF` | `#211E17` | cards |
| `line` | `#16140F` | `#FBF7F0` | borders / hard shadows |
| `link` | `#2D3DBF` | `#8FB6FF` | inline links |
| `yellow` | `#FFD23F` | (fixed) | accent block — **ink** text |
| `pink` | `#FF5DA2` | (fixed) | accent block — **ink** text |
| `blue` | `#2D3DBF` | (fixed) | accent block — **white** text |
| `green` | `#0B6B45` | (fixed) | accent block — **white** text |

Key ratios (all **pass** AA; full list printed by the script):

| Pair | Ratio |
| --- | --- |
| body text on paper (light) | 17.2:1 |
| soft text on paper (light) | 8.8:1 |
| link (blue) on paper (light) | 7.8:1 |
| ink on yellow | 12.7:1 |
| ink on pink | 6.4:1 |
| white on blue | 8.3:1 |
| white on green | 6.6:1 |
| body text on paper (dark) | 17.5:1 |
| soft text on paper (dark) | 11.4:1 |
| link (sky) on paper (dark) | 9.2:1 |
| blue focus ring on paper | 7.8:1 |
| yellow focus ring on blue / green | 5.7:1 / 4.5:1 |

If you change a color, update both `app/globals.css` and the hexes in
`scripts/contrast.mjs`, then run the script — it must pass before you ship.

## Accessibility notes

- One `<h1>` per page, logical heading order, semantic landmarks, a
  skip-to-content link on every page (first focusable element).
- Visible, on-brand focus ring on every interactive element (blue on paper,
  yellow on dark/blue/green grounds); 44px minimum touch targets.
- `prefers-reduced-motion`: reveal/parallax animations are disabled and content
  appears in place — handled globally in `globals.css` **and** in the motion
  components (`useReducedMotion`), so nothing ever starts off-screen.
- `prefers-color-scheme`: real dark mode via flipped tokens.
- Decorative graphics are `aria-hidden`; the contact form wires labels,
  `aria-invalid`, `aria-describedby`, `role="alert"` errors, and moves focus to
  the first invalid field on error and to the confirmation on success.

## Swapping the placeholder name, copy, and assets

- **Product name** — change `SITE_NAME` in [`lib/site.ts`](lib/site.ts). Nothing
  else hardcodes it; every page, the nav, the footer, and `<title>` read from it.
  Tagline, description, nav links, and CTA targets live in the same file.
- **Copy** — page text lives inline in each `app/<route>/page.tsx`. The voice
  rules and the banned-words list are in `docs/DESIGN_SYSTEM.md`.
- **Illustrations** — the illustration world is the dominant design element, and
  it's a single cohesive set: **[Open Doodles](https://www.opendoodles.com/)**
  (public domain / CC0). Every doodle is built from just two colors — `ink`
  (linework) + one flat `accent` — so the whole set recolors cleanly to the
  palette and reads as one bold, neo-brutalist world. Source SVGs came from the
  `lunahq/react-open-doodles` mirror (MIT) and were recolored so the **linework is
  `currentColor`** and the **accent is a baked palette token**, then inlined
  per-doodle (one module each) under
  [`components/illustrations/inline/`](components/illustrations/inline). Inlining
  is what lets the art float **frame-free** and adapt its linework to any ground.
  They're wired through concept-named components in
  [`components/illustrations/index.tsx`](components/illustrations/index.tsx)
  (`BrowserScan`, `FindingsReport`, `FixPass`, `ContrastEye`, `KeyboardNav`,
  `AssistiveWaves`, `EnvelopeSend`, `Signpost`, plus `HeroScene`/`ProofScene`/
  `CtaScene`). Pages place them by concept, so to re-theme the whole site you only
  touch that one module.
  - **Frameless + animated.** [`Doodle`](components/illustrations/Doodle.tsx)
    renders a doodle with no mat/border and a gentle idle drift (whole-figure bob +
    sway, varied per `seed`, disabled under reduced motion — the SVG is inlined so
    the art is present without JS, only the drift needs it). All decorative
    (`aria-hidden`).
  - **Linework reads on any ground.** Because the lines are `currentColor`, set the
    `ink` prop to match the ground: `text-fg` on neutral page/card (flips dark↔light),
    `text-on-accent` on blue/green, `text-[var(--ink)]` on pink/yellow. The accent
    FILL is baked in. This is what replaced the old fixed light mat.
  - `IllustrationScene` is the **dominant, layered** block used on the home page:
    the floating doodle (passed as `children`), parallax "world-shape" texture
    drifting behind it, and an optional brutalist `prop` (e.g. the report card)
    breaking past a corner. The world-shapes (star, blob, burst, arrow, squiggle,
    dots, ring) live in [`components/illustrations/shapes.tsx`](components/illustrations/shapes.tsx)
    and take their color from `currentColor` (set with a `text-*` utility).
  - To swap art: recolor another Open Doodle (set every `ink` fill to `currentColor`
    and the `accent` fill to a palette token), inline it under `inline/<name>.ts`,
    and point the concept component at it.
  - There's also a generic `Illustration` / `Frame` / `IllustrationPlaceholder`
    in [`components/ui/Illustration.tsx`](components/ui/Illustration.tsx) for ad-hoc
    framed art (pass `decorative` for aria-hidden + empty alt, or a real `alt`).

### Asset sources + licenses

| Asset | Source | License |
| --- | --- | --- |
| Space Grotesk (display font) | Google Fonts via `next/font` | SIL Open Font License 1.1 |
| Inter (body font) | Google Fonts via `next/font` | SIL Open Font License 1.1 |
| Icons | `lucide-react` | ISC |
| Illustrations (`components/illustrations/inline/*.ts`) | [Open Doodles](https://www.opendoodles.com/) (via `lunahq/react-open-doodles`, MIT) | Public domain (CC0) — free for commercial & personal use, no attribution required |
| World-shapes (`components/illustrations/shapes.tsx`) | Authored for this project | Project-owned |

The doodle → concept mapping and per-scene accent colors are listed at the top of
`components/illustrations/index.tsx`. Record the source + license of any new asset
you add to `public/` in this table.

## Auth — where it plugs in (scaffold only)

There is no auth backend yet. The pieces are staged so real auth (NextAuth /
Auth.js) drops in without reworking the public pages:

- `app/login/page.tsx`, `app/signup/page.tsx` — placeholder pages with an honest
  "accounts aren't open yet" note. The shared form is
  `components/auth/AuthForm.tsx`, which has the primary integration point:
  `// TODO(auth): wire to NextAuth/Auth.js — replace this stubbed handler with
  signIn()/registration call`.
- `components/Nav.tsx` — header CTAs point at `/login` and `/signup` via
  `CTA` in `lib/site.ts`. A `TODO(auth)` marks where to read the session and
  branch on logged-in vs logged-out (render an account menu in the authed state).
- A `<SessionProvider>` and any post-auth redirect belong in `app/layout.tsx`.
