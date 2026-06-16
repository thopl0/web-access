import type { Metadata } from "next";
import { Check, ArrowRight } from "lucide-react";

import { Section, SectionHeading, Container } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Reveal } from "@/components/motion/Reveal";
import { FindingsReport, Signpost } from "@/components/illustrations";
import { FaqItem } from "@/components/pricing/FaqItem";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Three plans for scanning your site the way real people use it. A free plan you'd actually keep, plus paid tiers for more sites and scheduled checks. Prices aren't set yet.",
};

type Tier = {
  name: string;
  who: string;
  /** Price is a placeholder — see the "TBD" note on the page. */
  price: string;
  period?: string;
  features: string[];
  cta: { href: string; label: string };
  /** Render the price as a "Contact us" tier instead of a number. */
  contact?: boolean;
};

const TIERS: Tier[] = [
  {
    name: "Free",
    who: "For one site you want to keep honest.",
    price: "$TBD",
    period: "free to start",
    features: [
      "Scan one site",
      "A set number of scans each month",
      "The core automated checks — contrast, labels, alt text, focus, reading order",
      "Plain-language fixes for every issue we find",
    ],
    cta: { href: "/signup", label: "Start free" },
  },
  {
    name: "Pro",
    who: "For a developer or small team shipping often.",
    price: "$TBD",
    period: "/ mo",
    features: [
      "Several sites",
      "Many more scans, plus scheduled runs",
      "Auto-scan when a page changes",
      "Full checks, with AI judgment on the fuzzy stuff like alt quality",
      "Notifications when something new breaks",
    ],
    cta: { href: "/signup", label: "Start free, upgrade later" },
  },
  {
    name: "Business",
    who: "For agencies and teams with a lot to watch.",
    price: "Contact us",
    contact: true,
    features: [
      "Your whole team, with roles",
      "A large pool of sites",
      "Priority support from a real person",
      "Onboarding help and a shared view of every site's health",
    ],
    cta: { href: "/contact", label: "Talk to us" },
  },
];

export default function PricingPage() {
  return (
    <>
      {/* 1 · HERO ------------------------------------------------------------ */}
      <Section ariaLabelledby="pricing-hero-title" className="bg-bg">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
          <Reveal direction="up">
            <h1
              id="pricing-hero-title"
              className="text-5xl sm:text-6xl lg:text-7xl text-fg"
            >
              Honest plans. The numbers aren&apos;t set yet.
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-fg-soft max-w-2xl">
              Here&apos;s the shape of it: a free plan you&apos;d actually keep,
              and paid tiers for more sites and scans that run on their own. We
              haven&apos;t fixed the prices, so every figure below says TBD. No
              fake anchor, no &ldquo;was $X.&rdquo; When they&apos;re real,
              they&apos;ll show up here.
            </p>
          </Reveal>
          <Reveal direction="left" className="lg:justify-self-end">
            <FindingsReport className="w-full max-w-md" />
          </Reveal>
        </div>
      </Section>

      {/* 2 · TIERS ---------------------------------------------------------- */}
      <Section ariaLabelledby="tiers-title" className="bg-blue text-on-accent">
        <Reveal direction="up">
          <h2 id="tiers-title" className="sr-only">
            Plans and pricing
          </h2>
        </Reveal>

        <ul className="grid items-stretch gap-6 lg:grid-cols-3">
          {TIERS.map((tier, i) => {
            const featured = tier.name === "Pro";
            return (
              <Reveal
                key={tier.name}
                as="li"
                direction="up"
                delay={i * 0.08}
                className="h-full"
              >
                <Card
                  tone={featured ? "yellow" : "surface"}
                  className={
                    "flex h-full flex-col" +
                    (featured ? " lg:-mt-4 lg:mb-4" : "")
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-display text-2xl font-bold">
                      {tier.name}
                    </h3>
                    {featured ? (
                      <Badge>Most popular</Badge>
                    ) : null}
                  </div>

                  <p
                    className={
                      "mt-2 " +
                      (featured ? "text-[var(--ink)]/80" : "text-fg-soft")
                    }
                  >
                    {tier.who}
                  </p>

                  {/* Price area — every figure is a placeholder. */}
                  <div className="mt-6">
                    {tier.contact ? (
                      <p className="font-display text-4xl font-bold">
                        {tier.price}
                      </p>
                    ) : (
                      <p className="flex items-baseline gap-2">
                        <span className="font-display text-5xl font-bold">
                          {tier.price}
                        </span>
                        {tier.period ? (
                          <span
                            className={
                              "text-sm " +
                              (featured
                                ? "text-[var(--ink)]/70"
                                : "text-fg-soft")
                            }
                          >
                            {tier.period}
                          </span>
                        ) : null}
                      </p>
                    )}
                    {!tier.contact ? (
                      <p
                        className={
                          "mt-1 text-sm " +
                          (featured
                            ? "text-[var(--ink)]/70"
                            : "text-fg-soft")
                        }
                      >
                        Pricing not finalized — TBD.
                      </p>
                    ) : null}
                  </div>

                  {/* Features. Check icons are decorative; the text carries it. */}
                  <ul className="mt-6 space-y-3">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <span
                          className={
                            "mt-0.5 inline-flex size-6 shrink-0 items-center justify-center border-[3px] border-[var(--ink)] " +
                            (featured ? "bg-surface" : "bg-green")
                          }
                        >
                          <Check
                            className={
                              "size-4 " +
                              (featured ? "text-fg" : "text-on-accent")
                            }
                            strokeWidth={3}
                            aria-hidden="true"
                          />
                        </span>
                        <span
                          className={
                            featured ? "text-[var(--ink)]" : "text-fg"
                          }
                        >
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-8 pt-2">
                    <Button
                      href={tier.cta.href}
                      variant={featured ? "blue" : "outline"}
                      size="lg"
                      className="w-full"
                    >
                      {tier.cta.label}
                    </Button>
                  </div>
                </Card>
              </Reveal>
            );
          })}
        </ul>

        {/* Honest reassurance about the free tier. */}
        <Reveal direction="up" className="mt-10">
          <p className="max-w-3xl text-lg text-on-accent/90">
            The free plan isn&apos;t a locked-up trial that nags you to pay.
            It runs the real checks and gives you the real fixes. We build for
            people who get shut out of the web — gating the basics behind a
            paywall would miss the whole point. Pay when you need more sites or
            want the scans to run without you.
          </p>
        </Reveal>
      </Section>

      {/* 3 · FAQ ------------------------------------------------------------- */}
      <Section ariaLabelledby="faq-title" className="bg-bg">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_auto] lg:gap-12">
          <Reveal direction="up">
            <SectionHeading
              id="faq-title"
              title="The fine print, in plain words."
              lead="The things people ask before they sign up. If yours isn't here, ask us."
            />
          </Reveal>
          <Reveal direction="left" className="lg:justify-self-end">
            <Signpost className="w-full max-w-xs" />
          </Reveal>
        </div>

        <Reveal direction="up" className="mt-10">
          <div className="grid max-w-3xl gap-4">
            <FaqItem question="What counts as a &ldquo;site&rdquo;?">
              <p>
                One domain you own — say <code>yourshop.com</code>, with all the
                pages under it. A separate domain or subdomain is a separate
                site. Plans differ on how many you can scan, and that&apos;s the
                count we mean.
              </p>
            </FaqItem>

            <FaqItem question="Can I change plans later?">
              <p>
                Yes, any time, both directions. Start free and move up when you
                add sites or want scheduled scans. Drop back down if your needs
                shrink. Nothing locks you in.
              </p>
            </FaqItem>

            <FaqItem question="What&apos;s actually in the free plan?">
              <p>
                One site, a set number of scans a month, and the core automated
                checks — contrast, missing labels, weak alt text, focus you
                can&apos;t see, reading order. Every issue comes with the same
                plain-language fix the paid plans get. It&apos;s a real tool,
                not a teaser.
              </p>
            </FaqItem>

            <FaqItem question="Do you store my site&apos;s data?">
              <p>
                We keep the results — the list of issues and the fixes — so you
                can come back to them. The raw render we load to test your page
                is discarded once the scan finishes. We don&apos;t hang on to a
                copy of your site.
              </p>
            </FaqItem>

            <FaqItem question="When will prices be set?">
              <p>
                Not yet — that&apos;s why every figure here says TBD. They&apos;re
                placeholders, not the real numbers, and we won&apos;t pretend
                otherwise. The moment they&apos;re decided, this page gets them.
              </p>
            </FaqItem>

            <FaqItem question="Do I need a card to start?">
              <p>
                No. The free plan needs nothing but an email. You only reach for
                a card if you decide to move up — and even then, you&apos;ll see
                the price first, once {SITE_NAME} has one to show.
              </p>
            </FaqItem>
          </div>
        </Reveal>
      </Section>

      {/* 4 · CTA BAND ------------------------------------------------------- */}
      <Section ariaLabelledby="pricing-cta-title" className="bg-green text-on-accent">
        <Reveal direction="up">
          <Container className="px-0 text-center">
            <h2
              id="pricing-cta-title"
              className="text-4xl sm:text-5xl lg:text-6xl text-on-accent"
            >
              Start free. Decide the rest later.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg sm:text-xl text-on-accent/90">
              Scan a site today and see what {SITE_NAME} finds. No card, no
              price tag yet, no reason to wait. Got a bigger setup? Tell us about
              it.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Button href="/signup" variant="yellow" size="lg">
                Start a free scan
                <ArrowRight
                  className="size-5"
                  strokeWidth={2.75}
                  aria-hidden="true"
                />
              </Button>
              <Button href="/contact" variant="outline" size="lg">
                Talk to us
              </Button>
            </div>
          </Container>
        </Reveal>
      </Section>
    </>
  );
}
