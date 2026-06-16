import Link from "next/link";
import {
  CTA,
  FOOTER_LINKS,
  NAV_LINKS,
  SITE_NAME,
  SITE_TAGLINE,
} from "@/lib/site";

/**
 * Site footer with a sitemap and the accessibility-statement link. Kept as a
 * server component — no interactivity.
 */
export function Footer() {
  const year = 2026; // build-time constant; bump or wire to build date as needed

  return (
    <footer className="mt-auto border-t-[3px] border-[var(--color-line)] bg-bg">
      <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <p className="font-display text-2xl font-bold">
              <span className="bg-yellow text-[var(--ink)] border-[3px] border-[var(--ink)] px-2 py-0.5">
                {SITE_NAME}
              </span>
            </p>
            <p className="mt-4 max-w-xs text-fg-soft">{SITE_TAGLINE}</p>
          </div>

          <nav aria-labelledby="footer-pages-heading">
            <h2
              id="footer-pages-heading"
              className="font-display text-sm font-bold uppercase tracking-wide text-fg-soft"
            >
              Pages
            </h2>
            <ul className="mt-4 flex flex-col gap-3">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-fg underline-offset-4 hover:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-more-heading">
            <h2
              id="footer-more-heading"
              className="font-display text-sm font-bold uppercase tracking-wide text-fg-soft"
            >
              More
            </h2>
            <ul className="mt-4 flex flex-col gap-3">
              {FOOTER_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-fg underline-offset-4 hover:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href={CTA.secondary.href}
                  className="text-fg underline-offset-4 hover:underline"
                >
                  {CTA.secondary.label}
                </Link>
              </li>
              <li>
                <Link
                  href={CTA.primary.href}
                  className="text-fg underline-offset-4 hover:underline"
                >
                  {CTA.primary.label}
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t-[3px] border-[var(--color-line)] pt-6 text-sm text-fg-soft sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {SITE_NAME}. {SITE_NAME} is a working placeholder name.
          </p>
          <p>Built to be used by everyone. We test that, we don&apos;t assume it.</p>
        </div>
      </div>
    </footer>
  );
}
