/**
 * Single source of truth for product name + site metadata.
 *
 * `SITE_NAME` is a PLACEHOLDER ("Inclusio"). To rebrand, change it here and
 * nowhere else — every page, the nav, the footer, and <title> read from this.
 */
export const SITE_NAME = "Inclusio";

export const SITE_TAGLINE = "See your site the way real people actually use it.";

export const SITE_DESCRIPTION =
  "An embeddable tool that scans your site the way assistive tech does, finds what's blocking people, and hands you the exact fix for each issue.";

/** Primary nav — used by the header and the footer sitemap. */
export const NAV_LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" },
] as const;

/** Footer-only links (kept out of the top nav to avoid clutter). */
export const FOOTER_LINKS = [
  { href: "/accessibility", label: "Accessibility statement" },
] as const;

/** Where the header CTAs point. Auth is scaffolded; see /login and /signup. */
export const CTA = {
  primary: { href: "/signup", label: "Start a free scan" },
  secondary: { href: "/login", label: "Log in" },
} as const;
