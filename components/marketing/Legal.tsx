import type { ReactNode } from "react";

import { Section } from "@/components/ui/Section";
import { Reveal } from "@/components/motion/Reveal";

/**
 * Shared chrome for the long-form legal pages (privacy, terms). Keeps both in one readable column and
 * one visual language — a plain hero with a "last updated" line, then numbered sections. Deliberately
 * lighter than the marketing pages: legal text wants calm, scannable prose, not full-bleed colour blocks.
 *
 * Accessibility: a single <h1> in the hero, each section is a real <h2> with the <section> named by it,
 * and the prose styles links/lists for legibility. No icons carry meaning here.
 */

/** Tailwind child-selector prose styles so section bodies can be written as plain <p>/<ul>/<strong>. */
export const LEGAL_PROSE =
  "space-y-4 text-fg-soft leading-relaxed " +
  "[&_a]:font-semibold [&_a]:text-link [&_a]:underline [&_a]:underline-offset-2 " +
  "[&_strong]:font-semibold [&_strong]:text-fg " +
  "[&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_li]:marker:text-fg-soft " +
  "[&_h3]:mt-6 [&_h3]:font-display [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-fg";

export function LegalShell({
  title,
  intro,
  updated,
  children,
}: {
  title: string;
  intro: ReactNode;
  updated: string;
  children: ReactNode;
}) {
  return (
    <Section ariaLabelledby="legal-title" className="bg-bg">
      <div className="max-w-3xl">
        <Reveal direction="up">
          <p className="mb-4 inline-block border-[3px] border-[var(--ink)] bg-yellow px-3 py-1 text-sm font-bold uppercase tracking-wide text-[var(--ink)] font-display">
            Legal
          </p>
          <h1 id="legal-title" className="text-4xl sm:text-5xl lg:text-6xl text-fg">
            {title}
          </h1>
          <p className="mt-5 text-lg sm:text-xl text-fg-soft">{intro}</p>
          <p className="mt-4 text-base text-fg-soft">Last updated {updated}.</p>
        </Reveal>

        <hr className="my-12 border-t-[3px] border-[var(--color-line)]" />

        <div className="space-y-12">{children}</div>
      </div>
    </Section>
  );
}

/** One numbered legal section: a named <h2> and its prose body. */
export function LegalSection({
  n,
  id,
  title,
  children,
}: {
  n: number;
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <Reveal direction="up">
        <h2 id={id} className="font-display text-2xl font-bold text-fg sm:text-3xl">
          <span className="mr-2 text-fg-soft tabular-nums">{n}.</span>
          {title}
        </h2>
        <div className={`mt-4 ${LEGAL_PROSE}`}>{children}</div>
      </Reveal>
    </section>
  );
}
