import type { Metadata } from "next";
import {
  PanelsTopLeft,
  Keyboard,
  MousePointerClick,
  Contrast,
  Moon,
  ImageOff,
  FormInput,
  ScanLine,
  ArrowRight,
} from "lucide-react";

import { Section, SectionHeading, Container } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Reveal } from "@/components/motion/Reveal";
import { ContrastEye, AssistiveWaves } from "@/components/illustrations";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Accessibility statement",
  description:
    "How we built this site to WCAG 2.2 AA — tested, not assumed — what we check, where we still fall short, and how to tell us if something blocks you.",
};

const LAST_REVIEWED = "16 June 2026";

/**
 * The concrete things we've actually done on this site. Each one maps to real
 * code: semantic landmarks in the layout, the skip link, the global focus ring,
 * 44px targets in Button/Field, the contrast script, reduced-motion handling,
 * dark mode via prefers-color-scheme, image alt rules, and the contact form.
 * Icons are decorative — the heading carries the meaning.
 */
const DONE = [
  {
    icon: PanelsTopLeft,
    title: "Real structure, in order",
    body: "One <h1> per page and headings that never skip a level. The page is laid out with proper HTML landmarks — a header, a single main, a footer — so a screen reader can jump straight to the part it wants.",
  },
  {
    icon: ScanLine,
    title: "Skip to content, every page",
    body: "Press Tab the moment a page loads and the first thing you land on is a skip link. Hit Enter and you're past the navigation, straight into the main content. No tabbing through the menu on every page.",
  },
  {
    icon: Keyboard,
    title: "Works without a mouse",
    body: "Every link, button, and form field is reachable and operable from the keyboard alone. Focus moves in the order you'd expect, and nothing traps it. Drop your mouse and try it — that's the test we set for ourselves.",
  },
  {
    icon: MousePointerClick,
    title: "A focus ring you can't miss",
    body: "When something has keyboard focus it gets a thick, on-brand outline — blue on paper, yellow on the dark and colored blocks where blue would disappear. We never hide it to make a design look tidier.",
  },
  {
    icon: Contrast,
    title: "Every color pair checked",
    body: "Each text-and-background combination on the site is verified to WCAG 2.2 AA before it ships. A script, scripts/contrast.mjs, computes the real contrast ratio for every pair and fails the build if any one of them comes up short. The palette can't drift without us knowing.",
  },
  {
    icon: Moon,
    title: "Reduced motion and dark mode, honored",
    body: "Tell your system you prefer reduced motion and the scroll reveals and drifting shapes switch off — content is right there, no fade-in to wait through. Set your system to dark and the whole site flips to a dark theme that's contrast-checked too.",
  },
  {
    icon: ImageOff,
    title: "Images that earn their alt",
    body: "Decorative shapes and framing are hidden from screen readers, so they don't read out noise. The images that carry meaning get a real description. Nothing important is locked inside a picture with no words.",
  },
  {
    icon: FormInput,
    title: "A contact form that explains itself",
    body: "Every field has a visible label tied to its input. When something's wrong, the error sits next to the field, is announced out loud, and is wired to the input with aria-describedby and aria-invalid — so you know which field, and why, without guessing.",
  },
] as const;

const LIMITS = [
  "We haven't had a formal third-party audit yet. Everything here is our own testing — automated checks plus hands-on keyboard and screen-reader passes. We'll say so the day that changes.",
  "Screen-reader testing is ongoing, not finished. We test with more than one reader, but we can't claim we've caught every rough edge across every browser-and-reader combination. If you hit one, that's exactly the kind of thing we want to hear.",
  "This is a marketing site under active development. New pages and sections land regularly, and each one has to clear the same bar — but a page that went up yesterday has had less real-world use than one that's been here a while.",
  "Anything we embed from a third party is only as accessible as the people who built it. Where we can't fix an embed ourselves, we'll either replace it or find another way to give you the same thing.",
] as const;

export default function AccessibilityPage() {
  return (
    <>
      {/* 1 · HERO ----------------------------------------------------------- */}
      <Section ariaLabelledby="a11y-title" className="bg-bg">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_0.9fr] lg:items-center">
          <Reveal direction="up" className="max-w-3xl">
            <h1
              id="a11y-title"
              className="text-5xl sm:text-6xl lg:text-7xl text-fg"
            >
              We test this site the way we test yours.
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-fg-soft">
              {SITE_NAME} sells a tool that checks whether real people can use a
              website. It would be a strange thing to sell if our own site shut
              anyone out. So we hold this site to the same standard we hold
              yours to — and we check it, rather than hope.
            </p>
            <p className="mt-4 text-base text-fg-soft">
              Last reviewed {LAST_REVIEWED}.
            </p>
          </Reveal>
          <Reveal direction="up" delay={0.08} className="lg:justify-self-end">
            <ContrastEye className="w-full max-w-sm" />
          </Reveal>
        </div>
      </Section>

      {/* 2 · COMMITMENT ----------------------------------------------------- */}
      <Section ariaLabelledby="commit-title" className="bg-blue text-on-accent">
        <Reveal direction="up" className="max-w-3xl">
          <h2
            id="commit-title"
            className="text-4xl sm:text-5xl lg:text-6xl text-on-accent"
          >
            WCAG 2.2 AA, across the whole site.
          </h2>
          <div className="mt-6 space-y-4 text-lg sm:text-xl text-on-accent/90">
            <p>
              That&apos;s the target for every page here — not only the home
              page, not only the parts a visitor sees first. It&apos;s the same
              standard our product measures other sites against.
            </p>
            <p>
              The difference is that we don&apos;t take our own word for it. The
              same idea that runs the product runs the site: assume nothing,
              measure it. Some of those checks run on every build. Others we do
              by hand — tabbing through pages, turning on a screen reader,
              switching on reduced motion and dark mode to see what actually
              happens.
            </p>
          </div>
        </Reveal>
      </Section>

      {/* 3 · WHAT WE'VE DONE HERE ------------------------------------------- */}
      <Section ariaLabelledby="done-title" className="bg-bg">
        <Reveal direction="up">
          <SectionHeading
            id="done-title"
            title="What we've actually done."
            lead="Specifics, not promises. Each of these is something you can check yourself, right now, on the page you're reading."
          />
        </Reveal>

        <ul className="mt-12 grid gap-6 sm:grid-cols-2">
          {DONE.map((item, i) => {
            const Icon = item.icon;
            return (
              <Reveal key={item.title} as="li" direction="up" delay={(i % 2) * 0.08}>
                <Card className="h-full">
                  <span className="inline-flex size-12 items-center justify-center border-[3px] border-[var(--ink)] bg-yellow text-[var(--ink)] shadow-ink">
                    <Icon className="size-6" strokeWidth={2.75} aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 font-display text-2xl text-fg">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-fg-soft">{item.body}</p>
                </Card>
              </Reveal>
            );
          })}
        </ul>
      </Section>

      {/* 4 · CONFORMANCE STATUS --------------------------------------------- */}
      <Section ariaLabelledby="status-title" className="bg-bg">
        <Reveal direction="up">
          <Card className="sm:p-12">
            <div className="grid gap-10 lg:grid-cols-[1.6fr_0.9fr] lg:items-center">
              <div className="max-w-3xl">
                <h2
                  id="status-title"
                  className="text-3xl sm:text-4xl lg:text-5xl text-fg"
                >
                  Where we stand, plainly.
                </h2>
                <p className="mt-5 text-lg text-fg-soft">
                  We aim for and work to WCAG 2.2 Level AA across this site. We
                  believe the site meets that standard today, on the strength of
                  our own automated and manual testing.
                </p>
                <p className="mt-4 text-lg text-fg-soft">
                  An honest statement names its limits. A site that claimed to
                  be perfect would be the first thing you shouldn&apos;t trust —
                  so here&apos;s where we&apos;re still working.
                </p>
              </div>
              <AssistiveWaves className="w-full max-w-xs lg:justify-self-end" />
            </div>
          </Card>
        </Reveal>
      </Section>

      {/* 5 · KNOWN LIMITS --------------------------------------------------- */}
      <Section ariaLabelledby="limits-title" className="bg-pink text-[var(--ink)]">
        <Reveal direction="up">
          <h2
            id="limits-title"
            className="text-4xl sm:text-5xl lg:text-6xl text-[var(--ink)]"
          >
            Known limits, told straight.
          </h2>
          <p className="mt-5 text-lg sm:text-xl text-[var(--ink)]/80 max-w-2xl">
            None of this is an excuse. It&apos;s a list of the work that&apos;s
            still open — the things we&apos;d want to know if we were you.
          </p>
        </Reveal>

        <ul className="mt-12 grid gap-6 sm:grid-cols-2">
          {LIMITS.map((text, i) => (
            <Reveal key={i} as="li" direction="up" delay={(i % 2) * 0.08}>
              <Card className="h-full">
                <p className="text-fg-soft">{text}</p>
              </Card>
            </Reveal>
          ))}
        </ul>
      </Section>

      {/* 6 · STANDARDS ------------------------------------------------------ */}
      <Section ariaLabelledby="standards-title" className="bg-bg">
        <Reveal direction="up" className="max-w-3xl">
          <SectionHeading
            id="standards-title"
            title="The standard, in one line."
          />
          <p className="mt-6 text-lg text-fg-soft">
            We measure this site against the{" "}
            <a
              href="https://www.w3.org/TR/WCAG22/"
              className="text-link underline underline-offset-2 font-bold"
            >
              Web Content Accessibility Guidelines (WCAG) 2.2
            </a>
            , at Level AA. It&apos;s the same yardstick our product uses when it
            reads a site the way assistive tech does — so the bar we set for you
            is the bar we set for ourselves.
          </p>
        </Reveal>
      </Section>

      {/* 7 · REPORT A BARRIER (CTA) ----------------------------------------- */}
      <Section
        ariaLabelledby="report-title"
        className="bg-green text-on-accent"
      >
        <Reveal direction="up">
          <Container className="px-0 text-center">
            <h2
              id="report-title"
              className="text-4xl sm:text-5xl lg:text-6xl text-on-accent"
            >
              Hit a wall on this site? Tell us.
            </h2>
            <p className="mt-5 text-lg sm:text-xl text-on-accent/90 max-w-2xl mx-auto">
              If something here blocked you — a link you couldn&apos;t reach, a
              control that read out as nothing, text you couldn&apos;t make out
              — we want to know. Tell us the page, what you were using, and what
              went wrong. We read every one, and a specific report is the
              fastest way to get it fixed.
            </p>
            <div className="mt-8 flex justify-center">
              <Button href="/contact" variant="yellow" size="lg">
                Report an accessibility issue
                <ArrowRight
                  className="size-5"
                  strokeWidth={2.75}
                  aria-hidden="true"
                />
              </Button>
            </div>
          </Container>
        </Reveal>
      </Section>
    </>
  );
}
