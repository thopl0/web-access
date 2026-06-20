import Link from "next/link";
import Image from "next/image";

import { Button } from "@/components/ui/Button";
import { CookieSettingsButton } from "@/components/CookieSettingsButton";
import { CTA, SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/site";

/**
 * Site footer, in the spirit of Mozilla's: a brand mark + one-line blurb up top, grouped link columns,
 * a legal row, and a signature full-bleed wordmark across the bottom. Rendered as a solid dark `--ink`
 * block (high contrast with white text — the same fixed colours the site's accent sections use), so it
 * reads as one bold band regardless of the light/dark theme above it.
 *
 * Accessibility (this is an accessibility product, so the footer practices it): each link column is a
 * named <nav> landmark; the logo is decorative (the name sits right beside it) so it carries no alt;
 * and the giant wordmark is purely typographic decoration, hidden from assistive tech so a screen
 * reader doesn't read the long domain a second time.
 */

/** Grouped link columns. Hrefs mirror the real routes; grouping is footer-specific. */
const COLUMNS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: "Product",
    links: [
      { href: "/how-it-works", label: "How it works" },
      { href: "/features", label: "Features" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "/contact", label: "Contact" },
      { href: "/accessibility", label: "Accessibility statement" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/privacy", label: "Privacy policy" },
      { href: "/terms", label: "Terms of service" },
    ],
  },
];

/** Compact links repeated in the legal row. */
const LEGAL_ROW = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/accessibility", label: "Accessibility" },
];

export function Footer() {
  const year = 2026; // build-time constant; bump or wire to build date as needed

  return (
    <footer className="mt-auto bg-[var(--ink)] text-on-accent">
      <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8">
        {/* Top band: brand mark + blurb, and the primary calls to action. */}
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4 max-w-md">
            <Image
              src="/logo.png"
              alt=""
              width={56}
              height={56}
              unoptimized
              className="size-12 shrink-0 border-[3px] border-on-accent/15 sm:size-14"
            />
            <p className="text-sm leading-relaxed text-on-accent/80">{SITE_DESCRIPTION}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3 lg:shrink-0">
            <Button href={CTA.primary.href} variant="yellow" size="md">
              {CTA.primary.label}
            </Button>
            <Link
              href={CTA.secondary.href}
              className="inline-flex min-h-[44px] items-center px-2 font-display font-bold text-on-accent underline-offset-4 hover:underline"
            >
              {CTA.secondary.label}
            </Link>
          </div>
        </div>

        <hr className="my-12 border-t border-on-accent/15" />

        {/* Columns: the wordmark + tagline block, then the grouped link lists. */}
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div>
            <p className="font-display text-2xl font-bold">
              <span className="border-[3px] border-[var(--ink)] bg-yellow px-2 py-0.5 text-[var(--ink)]">
                {SITE_NAME}
              </span>
            </p>
            <p className="mt-4 max-w-xs text-on-accent/75">{SITE_TAGLINE}</p>
          </div>

          {COLUMNS.map((col) => {
            const headingId = `footer-${col.heading.toLowerCase()}-heading`;
            return (
              <nav key={col.heading} aria-labelledby={headingId}>
                <h2
                  id={headingId}
                  className="font-display text-sm font-bold uppercase tracking-wide text-on-accent/55"
                >
                  {col.heading}
                </h2>
                <ul className="mt-4 flex flex-col gap-3">
                  {col.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-on-accent/85 underline-offset-4 hover:text-on-accent hover:underline"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            );
          })}
        </div>

        <hr className="my-12 border-t border-on-accent/15" />

        {/* Legal row: copyright + the compact legal links. */}
        <div className="flex flex-col gap-4 text-sm text-on-accent/70 sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} {SITE_NAME}. All rights reserved.</p>
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {LEGAL_ROW.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="font-bold text-on-accent/85 underline-offset-4 hover:text-on-accent hover:underline"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <CookieSettingsButton className="font-bold text-on-accent/85 underline-offset-4 hover:text-on-accent hover:underline" />
            </li>
          </ul>
        </div>
      </div>

      {/* Signature full-bleed wordmark — a yellow band closing the page. Decorative: the name is
          already announced above, so this is hidden from assistive tech. */}
      <div aria-hidden="true" className="overflow-hidden bg-yellow px-5 pt-4 pb-10 sm:px-8">
        <p className="select-none whitespace-nowrap text-center font-display font-bold leading-none tracking-tight text-[var(--ink)] text-[clamp(1.25rem,6.2vw,9rem)]">
          {SITE_NAME}
        </p>
      </div>
    </footer>
  );
}
