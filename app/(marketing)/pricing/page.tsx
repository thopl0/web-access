import type { Metadata } from "next";
import { Check, ArrowRight } from "lucide-react";

import { Section, SectionHeading, Container } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Reveal } from "@/components/motion/Reveal";
import { FindingsReport, Signpost } from "@/components/illustrations";
import { FaqItem } from "@/components/pricing/FaqItem";
import { UpgradeButton } from "@/components/pricing/UpgradeButton";
import { SITE_NAME } from "@/lib/site";
import { auth } from "@/auth";
import { getUserPlan } from "@/lib/server/entitlements";
import { billingConfigured, priceIdForPlan } from "@/lib/server/billing";
import { PLANS, type Plan } from "@/lib/entitlements";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Three plans for scanning your site the way real people use it. A free plan you'd actually keep at $0, plus Pro at $29/mo and Business at $99/mo for more sites and scans that run on their own.",
};

type Tier = {
  /** Which entitlement row this card maps to. Numbers/labels below stay consistent with PLANS. */
  plan: Plan;
  who: string;
  /** Real monthly price in whole dollars. */
  price: string;
  period: string;
  features: string[];
};

// The three cards, in display order. Feature bullets are written by hand for voice, but every number
// is the real figure from PLANS (lib/entitlements.ts) so the page can never drift from what's enforced.
const TIERS: Tier[] = [
  {
    plan: "free",
    who: "For one site you want to keep honest.",
    price: "$0",
    period: "free forever",
    features: [
      `Scan ${PLANS.free.maxSites} site`,
      `${PLANS.free.scansPerMonth} scans each month`,
      "The core automated checks — contrast, labels, alt text, focus, reading order",
      "Plain-language fixes for every issue we find",
    ],
  },
  {
    plan: "pro",
    who: "For a developer or small team shipping often.",
    price: "$29",
    period: "/ mo",
    features: [
      `Up to ${PLANS.pro.maxSites} sites`,
      `${PLANS.pro.scansPerMonth.toLocaleString("en-US")} scans each month`,
      "AI judgment on the fuzzy stuff, like whether your alt text actually says something",
      "Scheduled monitoring — re-scan on a timer and when a page changes",
      "Downloadable artifacts: accessibility certificate, statement, and VPAT",
      "Runtime fixes the embed can apply live, plus notifications when something new breaks",
    ],
  },
  {
    plan: "business",
    who: "For agencies and teams with a lot to watch.",
    price: "$99",
    period: "/ mo",
    features: [
      `Up to ${PLANS.business.maxSites} sites`,
      `${PLANS.business.scansPerMonth.toLocaleString("en-US")} scans each month`,
      `Team seats for up to ${PLANS.business.teamSeats} people`,
      "Everything in Pro — AI judgment, monitoring, artifacts, runtime fixes",
      "Priority support from a real person",
    ],
  },
];

export default async function PricingPage() {
  // Who's looking? auth() returns null when logged out — no redirect, unlike getUser(). When signed
  // in we read the current plan so each card can show "Current plan" instead of an upgrade CTA.
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const currentPlan: Plan | null = userId ? await getUserPlan(userId) : null;

  // Is a real Stripe checkout possible at all? The secret key has to be set AND the per-plan price id
  // configured. When either is missing the upgrade buttons degrade to a disabled state — we never call
  // startCheckout when it can't work.
  const billingReady = billingConfigured();

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
              Honest plans. Real prices.
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-fg-soft max-w-2xl">
              A free plan you&apos;d actually keep at $0, and two paid tiers for
              more sites and scans that run on their own — Pro at $29 a month,
              Business at $99. No fake anchor, no &ldquo;was $X.&rdquo; The price
              you see is the price you pay.
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
            const featured = tier.plan === "pro";
            const isCurrent = currentPlan === tier.plan;
            return (
              <Reveal
                key={tier.plan}
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
                      {PLANS[tier.plan].label}
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

                  {/* Price area — real monthly figures. */}
                  <div className="mt-6">
                    <p className="flex items-baseline gap-2">
                      <span className="font-display text-5xl font-bold">
                        {tier.price}
                      </span>
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
                    </p>
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
                    {renderCta({
                      tier,
                      featured,
                      isCurrent,
                      loggedIn: Boolean(userId),
                      billingReady,
                    })}
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
                shrink. Nothing locks you in, and you&apos;ll always see the
                price before you commit.
              </p>
            </FaqItem>

            <FaqItem question="What&apos;s actually in the free plan?">
              <p>
                One site, {PLANS.free.scansPerMonth} scans a month, and the core
                automated checks — contrast, missing labels, weak alt text,
                focus you can&apos;t see, reading order. Every issue comes with
                the same plain-language fix the paid plans get. It&apos;s a real
                tool, not a teaser.
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

            <FaqItem question="What do Pro and Business add?">
              <p>
                More sites and a much bigger scan budget, plus the parts that run
                without you: AI judgment on fuzzy things like alt-text quality,
                scheduled monitoring, downloadable artifacts (certificate,
                statement, VPAT), and live runtime fixes. Business adds team
                seats and priority support on top.
              </p>
            </FaqItem>

            <FaqItem question="Do I need a card to start?">
              <p>
                No. The free plan needs nothing but an email. You only reach for
                a card if you decide to move up to Pro or Business — and even
                then, {SITE_NAME} shows you the price first.
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
              Start free. Upgrade when you outgrow it.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg sm:text-xl text-on-accent/90">
              Scan a site today and see what {SITE_NAME} finds. No card to start,
              no reason to wait. Need more sites or scans that run on their own?
              Pro is $29 a month, Business is $99.
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

/**
 * Pick the right call-to-action for a card given the visitor's auth state, their current plan, and
 * whether billing is live. Kept as a helper so the card JSX stays readable. The matrix:
 *
 *  Free tier   — logged out: "Start free" → /signup. Logged in on free: disabled "Current plan".
 *                Logged in on a paid plan: a plain link to /dashboard (no downgrade flow here).
 *  Paid tiers  — current plan: disabled "Current plan". Logged out: "Start free, then upgrade"
 *                → /signup?plan=…  Logged in: an UpgradeButton that runs startCheckout — disabled to
 *                "Billing not available yet" when Stripe or the price id is missing.
 */
function renderCta({
  tier,
  featured,
  isCurrent,
  loggedIn,
  billingReady,
}: {
  tier: Tier;
  featured: boolean;
  isCurrent: boolean;
  loggedIn: boolean;
  billingReady: boolean;
}) {
  const variant = featured ? "blue" : "outline";

  // A signed-in visitor already on this exact plan — nothing to buy.
  if (isCurrent) {
    return <CurrentPlanButton />;
  }

  // Free tier.
  if (tier.plan === "free") {
    if (!loggedIn) {
      return (
        <Button href="/signup" variant={variant} size="lg" className="w-full">
          Start free
        </Button>
      );
    }
    // Logged in but not on free (i.e. on a paid plan) — send them to the app rather than a downgrade.
    return (
      <Button href="/dashboard" variant={variant} size="lg" className="w-full">
        Go to your dashboard
      </Button>
    );
  }

  // Paid tier, logged out — funnel through signup; the plan hint may be ignored, which is fine.
  if (!loggedIn) {
    return (
      <Button
        href={`/signup?plan=${tier.plan}`}
        variant={variant}
        size="lg"
        className="w-full"
      >
        Start free, then upgrade
      </Button>
    );
  }

  // Paid tier, logged in. Only offer a real checkout when Stripe is configured AND this plan has a
  // price id; otherwise show a disabled "Billing not available yet" so we never call an action that
  // can't succeed.
  const purchasable = billingReady && priceIdForPlan(tier.plan) !== null;
  if (!purchasable) {
    return (
      <Button
        type="button"
        variant={variant}
        size="lg"
        className="w-full cursor-not-allowed opacity-60"
        disabled
      >
        Billing not available yet
      </Button>
    );
  }

  return (
    <UpgradeButton
      plan={tier.plan as "pro" | "business"}
      label={`Upgrade to ${PLANS[tier.plan].label}`}
      variant={variant}
    />
  );
}

/** The disabled "you're already here" button shown on the visitor's current plan's card. */
function CurrentPlanButton() {
  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className="w-full cursor-default opacity-70"
      disabled
      aria-disabled="true"
    >
      Current plan
    </Button>
  );
}
