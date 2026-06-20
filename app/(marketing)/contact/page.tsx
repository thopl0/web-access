import type { Metadata } from "next";
import { Mail, MessageSquare } from "lucide-react";

import { Section, Container } from "@/components/ui/Section";
import { Card } from "@/components/ui/Card";
import { Reveal } from "@/components/motion/Reveal";
import { EnvelopeSend } from "@/components/illustrations";
import { ContactForm } from "@/components/contact/ContactForm";
import { SITE_NAME, CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Got a question, a stuck scan, or something on this site that's hard to use? Tell us. A real person reads every message and writes back.",
};

export default function ContactPage() {
  return (
    <>
      {/* 1 · HERO ----------------------------------------------------------- */}
      <Section ariaLabelledby="contact-title" className="bg-bg">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_0.9fr] lg:items-center">
          <Reveal direction="up" className="max-w-3xl">
            <h1
              id="contact-title"
              className="text-5xl sm:text-6xl lg:text-7xl text-fg"
            >
              Say hello. We&apos;ll write back.
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-fg-soft">
              Question about a scan, stuck on a fix, or you found something on
              this site that&apos;s hard to use? Send it over. A person on the{" "}
              {SITE_NAME} team reads every message — no ticket bots, no canned
              replies.
            </p>
          </Reveal>
          <Reveal direction="up" delay={0.08} className="lg:justify-self-end">
            <EnvelopeSend className="w-full max-w-sm" />
          </Reveal>
        </div>
      </Section>

      {/* 2 · FORM + ALT CONTACT --------------------------------------------- */}
      <Section ariaLabelledby="form-title" className="bg-pink text-[var(--ink)]">
        <div className="grid gap-8 lg:grid-cols-[1.4fr_0.9fr] lg:items-start">
          {/* The form, in a brutalist framed card. Not gated behind motion: it
              renders in place even before the reveal animation runs. */}
          <Reveal direction="up">
            <Card className="sm:p-10">
              <h2 id="form-title" className="sr-only">
                Send the team a message
              </h2>
              <ContactForm />
            </Card>
          </Reveal>

          {/* Other ways to reach us — placeholder details, marked as such. */}
          <Reveal direction="up" delay={0.08}>
            <aside
              aria-labelledby="other-ways-title"
              className="flex flex-col gap-6"
            >
              <h2
                id="other-ways-title"
                className="font-display text-2xl text-[var(--ink)]"
              >
                Rather not use a form?
              </h2>

              <Card>
                <span className="inline-flex size-11 items-center justify-center border-[3px] border-[var(--ink)] bg-yellow text-[var(--ink)] shadow-ink">
                  <Mail className="size-5" strokeWidth={2.75} aria-hidden="true" />
                </span>
                <h3 className="mt-4 font-display text-lg text-fg">
                  Prefer email?
                </h3>
                <p className="mt-2 text-fg-soft">
                  Write to us directly — same inbox, same people.
                </p>
                <p className="mt-3 font-display font-bold break-words">
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="text-link underline underline-offset-2"
                  >
                    {CONTACT_EMAIL}
                  </a>
                </p>
              </Card>

              <Card>
                <span className="inline-flex size-11 items-center justify-center border-[3px] border-[var(--ink)] bg-blue text-on-accent shadow-ink">
                  <MessageSquare
                    className="size-5"
                    strokeWidth={2.75}
                    aria-hidden="true"
                  />
                </span>
                <h3 className="mt-4 font-display text-lg text-fg">
                  When you&apos;ll hear back
                </h3>
                <p className="mt-2 text-fg-soft">
                  Usually a working day or two. If something on this site
                  blocked you, say so in your message and it jumps the queue.
                </p>
              </Card>
            </aside>
          </Reveal>
        </div>
      </Section>

      {/* 3 · REASSURANCE ---------------------------------------------------- */}
      <Section ariaLabelledby="proof-title" className="bg-bg">
        <Reveal direction="up">
          <Container className="px-0">
            <Card className="sm:p-12">
              <div className="max-w-3xl">
                <h2
                  id="proof-title"
                  className="text-3xl sm:text-4xl text-fg"
                >
                  This form works the way we tell you yours should.
                </h2>
                <p className="mt-5 text-lg text-fg-soft">
                  Tab through it with the keyboard — every field lands somewhere
                  you can see. Submit it empty and a screen reader hears what went
                  wrong, then focus drops you on the first field to fix. Send it
                  for real and the &ldquo;thanks&rdquo; gets read out loud. We
                  built it this way on purpose.
                </p>
              </div>
            </Card>
          </Container>
        </Reveal>
      </Section>
    </>
  );
}
