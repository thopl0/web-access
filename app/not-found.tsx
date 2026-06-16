import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/motion/Reveal";
import { Signpost } from "@/components/illustrations";
import { NAV_LINKS } from "@/lib/site";

// Next sets the 404 status + noindex itself; a title is a nice-to-have.
export const metadata: Metadata = {
  title: "Page not found",
};

/**
 * Custom 404. Renders inside the root layout, so Nav + Footer wrap it and the
 * visitor always has a way out.
 */
export default function NotFound() {
  return (
    <Section ariaLabelledby="notfound-title" className="bg-bg">
      <Reveal direction="up" className="mx-auto max-w-2xl text-center">
        <Signpost className="mx-auto w-full max-w-xs" />

        <h1
          id="notfound-title"
          className="mt-8 text-4xl sm:text-5xl lg:text-6xl text-fg"
        >
          This page took a wrong turn.
        </h1>

        <p className="mt-5 text-lg sm:text-xl text-fg-soft">
          We looked, but there&apos;s nothing at this address. Maybe the link was
          old, or a letter got dropped somewhere. No harm done — here&apos;s the
          way back.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Button href="/" variant="blue" size="lg">
            Take me home
            <ArrowRight className="size-5" strokeWidth={2.75} aria-hidden="true" />
          </Button>
        </div>

        {/* A few common destinations, in case home isn't what they wanted. */}
        <nav aria-label="Helpful links" className="mt-10">
          <ul className="flex flex-wrap justify-center gap-3">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-flex min-h-[44px] items-center border-[3px] border-[var(--color-line)] bg-surface px-4 py-2 font-display font-bold text-fg no-underline brut-press"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Reveal>
    </Section>
  );
}
