import type { Metadata } from "next";
import {
  Contrast,
  Tags,
  Keyboard,
  ListOrdered,
  ImageOff,
  Crosshair,
  ScanLine,
  FileText,
  Wrench,
  ArrowRight,
} from "lucide-react";

import { Section, SectionHeading } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Reveal } from "@/components/motion/Reveal";
import { Parallax } from "@/components/motion/Parallax";
import { HeroReportCard } from "@/components/home/HeroReportCard";
import {
  BrowserScan,
  FindingsReport,
  FixPass,
  ContrastEye,
  Signpost,
  HeroScene,
  ProofScene,
  CtaScene,
  IllustrationScene,
} from "@/components/illustrations";
import { Star, Burst, Squiggle, Dots, Ring } from "@/components/illustrations/shapes";
import { SITE_NAME, CTA } from "@/lib/site";

// Home falls back to the layout's default <title>; we still set a sharp description.
export const metadata: Metadata = {
  description:
    "Scan your site the way a screen reader, a keyboard, and color-blind eyes do. Find what's blocking people, and get the exact fix for each thing — in plain words.",
};

/** The three teaser steps. Icons are decorative (label carries the meaning). */
const STEPS = [
  {
    icon: ScanLine,
    illustration: BrowserScan,
    title: "Scan",
    body: "Point us at a URL. We crawl it the way assistive tech does — not a quick CSS glance.",
  },
  {
    icon: FileText,
    illustration: FindingsReport,
    title: "Report",
    body: "Every blocker, ranked by who it shuts out. Each one written in plain English, no spec-speak.",
  },
  {
    icon: Wrench,
    illustration: FixPass,
    title: "Fix",
    body: "The exact change to make, where to make it, and how to check it actually worked.",
  },
] as const;

/** The categories we surface on the value grid. Tones alternate for rhythm. */
const CATCHES = [
  {
    icon: Contrast,
    tone: "blue" as const,
    title: "Low contrast",
    body: "Grey text on a grey card looks fine to you and vanishes for anyone with low vision. We measure it and tell you the ratio.",
  },
  {
    icon: Tags,
    tone: "surface" as const,
    title: "Missing labels",
    body: "An icon button with no name is a dead end on a screen reader. We catch every control that announces as nothing.",
  },
  {
    icon: Keyboard,
    tone: "pink" as const,
    title: "Keyboard traps",
    body: "Tab in, can't tab out. We walk your page with the keyboard and flag anywhere focus gets stuck.",
  },
  {
    icon: ListOrdered,
    tone: "surface" as const,
    title: "Reading order",
    body: "What looks top-to-bottom on screen can be a jumble in the DOM. We read it aloud in order, like a screen reader would.",
  },
  {
    icon: ImageOff,
    tone: "green" as const,
    title: "Weak alt text",
    body: "Not just missing alt — alt that says \"image\" or \"logo\" and tells a blind reader nothing. We grade it.",
  },
  {
    icon: Crosshair,
    tone: "surface" as const,
    title: "Focus you can't see",
    body: "If the focus ring is gone, keyboard users are lost on the page. We check that every step is visible.",
  },
] as const;

export default function Home() {
  return (
    <>
      {/* 1 · HERO ------------------------------------------------------------ */}
      <Section
        ariaLabelledby="hero-title"
        className="bg-bg"
        decoration={
          <>
            <Parallax speed={40} className="absolute right-[8%] top-10">
              <Star className="size-16 text-yellow sm:size-24" />
            </Parallax>
            <Parallax speed={-28} className="absolute left-[-2%] bottom-8">
              <Squiggle className="w-32 text-pink sm:w-44" />
            </Parallax>
          </>
        }
      >
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr]">
          <Reveal direction="up">
            <p className="mb-5 inline-block rotate-[-2deg] border-[3px] border-[var(--ink)] bg-yellow px-3 py-1 text-sm font-bold uppercase tracking-wide text-[var(--ink)] shadow-ink font-display">
              Free scan · no card
            </p>
            <h1
              id="hero-title"
              className="text-5xl sm:text-6xl lg:text-7xl text-fg"
            >
              See your site the way{" "}
              <span className="box-decoration-clone bg-yellow px-2 text-[var(--ink)]">
                real people
              </span>{" "}
              use it.
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-fg-soft max-w-xl">
              Plenty of people reach your site through a screen reader, a
              keyboard, or eyes that don&apos;t see the same colors you do.{" "}
              {SITE_NAME} finds what&apos;s blocking them — and hands you the
              specific fix, in plain words.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Button href={CTA.primary.href} variant="blue" size="lg">
                {CTA.primary.label}
              </Button>
              <Button href="/how-it-works" variant="outline" size="lg">
                See how it works
              </Button>
            </div>
          </Reveal>

          {/* Oversized hero scene: big doodle + the report card bleeding past a
              corner + parallax world-shapes drifting behind. */}
          <Reveal direction="left" delay={0.1}>
            <IllustrationScene
              variant="a"
              className="mx-auto w-full max-w-md lg:mr-0 lg:max-w-none"
              prop={
                <div className="w-56 rotate-[-3deg] sm:w-64">
                  <HeroReportCard />
                </div>
              }
              propClassName="-bottom-10 -left-6 hidden sm:block lg:-left-12"
            >
              <HeroScene ink="text-fg" className="rotate-[1.5deg]" />
            </IllustrationScene>
          </Reveal>
        </div>
      </Section>

      {/* 2 · PROBLEM / STAKES ----------------------------------------------- */}
      <Section
        ariaLabelledby="stakes-title"
        className="bg-blue text-on-accent"
        decoration={
          <>
            <Parallax speed={30} className="absolute right-[6%] top-12">
              <Ring className="size-24 text-yellow/70" />
            </Parallax>
            <Parallax speed={-20} className="absolute left-[10%] bottom-6">
              <Dots className="size-20 text-on-accent/40" />
            </Parallax>
          </>
        }
      >
        <div className="grid items-center gap-12 lg:grid-cols-[0.95fr_1.05fr]">
          <Reveal direction="right">
            <IllustrationScene
              variant="c"
              className="mx-auto w-full max-w-md lg:mx-0"
            >
              <Signpost ink="text-on-accent" className="rotate-[-1.5deg]" />
            </IllustrationScene>
          </Reveal>
          <Reveal direction="up">
            <h2
              id="stakes-title"
              className="text-4xl sm:text-5xl lg:text-6xl text-on-accent"
            >
              Someone got all the way to checkout. Then they left.
            </h2>
            <div className="mt-6 space-y-4 text-lg sm:text-xl text-on-accent/90">
              <p>
                Picture a blind shopper, mid-purchase, using a screen reader.
                Cart&apos;s full. They tab to pay. The button reads out as one
                word: &ldquo;button.&rdquo; No price, no label, no clue what it
                does.
              </p>
              <p>
                So they don&apos;t press it. They don&apos;t email you about it
                either. They just close the tab and buy somewhere else — and
                your analytics call it a bounce.
              </p>
              <p className="font-bold text-on-accent">
                That sale was ready. One missing label cost it. Multiply that by
                every page you&apos;ve never tested without a mouse.
              </p>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* 3 · HOW IT WORKS (teaser) ------------------------------------------ */}
      <Section ariaLabelledby="how-title" className="bg-bg">
        <Reveal direction="up">
          <SectionHeading
            id="how-title"
            eyebrow="How it works"
            title="Scan, read, fix."
            lead="No audit jargon. No 200-page PDF. Three steps, and you know exactly what to change."
          />
        </Reveal>

        <ol className="mt-12 grid gap-8 md:grid-cols-3">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            const Illustration = step.illustration;
            return (
              <Reveal key={step.title} as="li" direction="up" delay={i * 0.08}>
                <Card className="flex h-full flex-col">
                  {/* The doodle leads the card — it's the dominant element. */}
                  <Illustration className="mb-6 w-full" />
                  <span className="inline-flex size-12 items-center justify-center border-[3px] border-[var(--ink)] bg-yellow text-[var(--ink)] shadow-ink">
                    <Icon className="size-6" strokeWidth={2.75} aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 font-display text-2xl text-fg">
                    <span className="text-fg-soft">{i + 1}. </span>
                    {step.title}
                  </h3>
                  <p className="mt-2 text-fg-soft">{step.body}</p>
                </Card>
              </Reveal>
            );
          })}
        </ol>

        <Reveal direction="up" className="mt-10">
          <Button href="/how-it-works" variant="yellow">
            Walk through the whole thing
            <ArrowRight className="size-5" strokeWidth={2.75} aria-hidden="true" />
          </Button>
        </Reveal>
      </Section>

      {/* 4 · WHAT IT CATCHES ------------------------------------------------ */}
      <Section
        ariaLabelledby="catches-title"
        className="bg-pink text-[var(--ink)]"
        decoration={
          <Parallax speed={26} className="absolute left-[4%] bottom-10">
            <Burst className="size-20 text-[var(--ink)]/30" />
          </Parallax>
        }
      >
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
          <Reveal direction="up">
            <h2
              id="catches-title"
              className="text-4xl sm:text-5xl lg:text-6xl text-[var(--ink)]"
            >
              The stuff that quietly shuts people out.
            </h2>
            <p className="mt-5 text-lg sm:text-xl text-[var(--ink)]/80 max-w-xl">
              These are the problems that don&apos;t throw errors and don&apos;t
              show up in a design review — but stop real people cold.
            </p>
          </Reveal>
          <Reveal direction="left" delay={0.1}>
            <IllustrationScene
              variant="b"
              className="mx-auto w-full max-w-sm lg:ml-auto lg:mr-0"
            >
              <ContrastEye ink="text-[var(--ink)]" className="rotate-[1.5deg]" />
            </IllustrationScene>
          </Reveal>
        </div>

        <ul className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {CATCHES.map((item, i) => {
            const Icon = item.icon;
            // Match text color to the ground: white on dark accents (blue/green),
            // fixed ink on light accents (pink/yellow), flipping soft on surface.
            const darkAccent = item.tone === "blue" || item.tone === "green";
            const bodyClass =
              item.tone === "surface"
                ? "mt-2 text-fg-soft"
                : darkAccent
                  ? "mt-2 text-on-accent/90"
                  : "mt-2 text-[var(--ink)]";
            return (
              <Reveal key={item.title} as="li" direction="up" delay={(i % 3) * 0.08}>
                <Card tone={item.tone} className="h-full">
                  <Icon
                    className={darkAccent ? "size-8 text-on-accent" : "size-8"}
                    strokeWidth={2.75}
                    aria-hidden="true"
                  />
                  <h3 className="mt-4 font-display text-xl">{item.title}</h3>
                  <p className={bodyClass}>{item.body}</p>
                </Card>
              </Reveal>
            );
          })}
        </ul>
      </Section>

      {/* 5 · PROOF / WE WALK THE WALK --------------------------------------- */}
      <Section
        ariaLabelledby="proof-title"
        className="bg-bg"
        decoration={
          <Parallax speed={22} className="absolute right-[6%] top-10">
            <Star className="size-16 text-green" />
          </Parallax>
        }
      >
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <Reveal direction="right">
            <IllustrationScene
              variant="b"
              className="mx-auto w-full max-w-md lg:mx-0"
            >
              <ProofScene ink="text-fg" className="rotate-[-1.5deg]" />
            </IllustrationScene>
          </Reveal>
          <Reveal direction="up">
            <h2
              id="proof-title"
              className="text-3xl sm:text-4xl lg:text-5xl text-fg"
            >
              This page passes its own test.
            </h2>
            <p className="mt-5 text-lg text-fg-soft">
              We built {SITE_NAME} to the standard we sell. So try it on us.
              Drop your mouse and tab through this site — every step stays
              visible and lands somewhere sensible. Turn on a screen reader and
              the headings, links, and landmarks all make sense out loud.
            </p>
            <p className="mt-4 text-lg text-fg-soft">
              If a site that sells accessibility wasn&apos;t accessible,
              you&apos;d be right to close the tab. Go ahead — kick the tires.
            </p>
          </Reveal>
        </div>
      </Section>

      {/* 6 · FINAL CTA ------------------------------------------------------ */}
      <Section
        ariaLabelledby="final-cta-title"
        className="bg-green text-on-accent"
        innerClassName="text-center"
        decoration={
          <>
            <Parallax speed={34} className="absolute left-[10%] top-12">
              <Burst className="size-20 text-yellow" />
            </Parallax>
            <Parallax speed={-24} className="absolute right-[8%] bottom-12">
              <Star className="size-16 text-yellow" />
            </Parallax>
          </>
        }
      >
        <Reveal direction="up">
          <IllustrationScene
            variant="c"
            className="mx-auto mb-10 w-full max-w-xs"
          >
            <CtaScene ink="text-on-accent" className="rotate-[2deg]" />
          </IllustrationScene>
          <h2
            id="final-cta-title"
            className="text-4xl sm:text-5xl lg:text-6xl text-on-accent"
          >
            Find out who can&apos;t use your site. Today.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg sm:text-xl text-on-accent/90">
            One URL, one scan, a clear list of what to fix first. No card, no
            audit fee, no waiting on a specialist.
          </p>
          <div className="mt-8 flex justify-center">
            <Button href={CTA.primary.href} variant="yellow" size="lg">
              {CTA.primary.label}
              <ArrowRight className="size-5" strokeWidth={2.75} aria-hidden="true" />
            </Button>
          </div>
        </Reveal>
      </Section>
    </>
  );
}
