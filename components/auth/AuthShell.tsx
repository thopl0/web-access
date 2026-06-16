import type { ReactNode } from "react";

import { Section } from "@/components/ui/Section";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Reveal } from "@/components/motion/Reveal";

/**
 * Optional decorative illustration shown above the heading. Pass a framed
 * illustration from @/components/illustrations (already decorative/aria-hidden).
 */

/**
 * Shared chrome for the /login and /signup placeholder pages: a centered
 * brutalist Card inside a Section, with a single <h1>, an honest "Coming soon"
 * note, and a slot for the actual form + footer links.
 *
 * This is a Server Component — the interactive form lives in AuthForm, which
 * each page passes in as `children`.
 */
export function AuthShell({
  titleId,
  title,
  intro,
  illustration,
  children,
  footer,
}: {
  /** id wired to both the <section> aria-labelledby and the <h1>. */
  titleId: string;
  title: string;
  /** One human line under the heading. */
  intro: string;
  /** Optional decorative illustration above the heading. */
  illustration?: ReactNode;
  /** The form (a client component). */
  children: ReactNode;
  /** Cross-link row under the card (e.g. "New here? Create an account"). */
  footer: ReactNode;
}) {
  return (
    <Section ariaLabelledby={titleId} className="bg-bg">
      <Reveal direction="up" className="mx-auto w-full max-w-md">
        <div className="text-center">
          {illustration ? (
            <div className="mx-auto mb-6 w-full max-w-[12rem]">
              {illustration}
            </div>
          ) : null}
          <Badge tone="yellow">Coming soon</Badge>
          <h1 id={titleId} className="mt-5 text-4xl sm:text-5xl text-fg">
            {title}
          </h1>
          <p className="mt-4 text-lg text-fg-soft">{intro}</p>
        </div>

        {/* Honest note: accounts aren't open yet. Not a fake logged-in state. */}
        <p className="mt-6 text-center text-sm text-fg-soft">
          Accounts aren&apos;t open yet — this is a preview of where they&apos;ll
          live.
        </p>

        <Card tone="surface" className="mt-6">
          {children}
        </Card>

        <div className="mt-6 text-center text-fg-soft">{footer}</div>
      </Reveal>
    </Section>
  );
}
