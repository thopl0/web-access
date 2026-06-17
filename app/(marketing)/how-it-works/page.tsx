import {
  Code2,
  ScanLine,
  FileText,
  Wrench,
  Eye,
  Keyboard,
  Contrast,
  Tags,
  ImageOff,
  AlignLeft,
  BellRing,
  CheckCircle2,
} from "lucide-react";
import { Section, SectionHeading } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Reveal } from "@/components/motion/Reveal";
import { StepCard } from "@/components/how-it-works/StepCard";
import {
  BrowserScan,
  KeyboardNav,
  AssistiveWaves,
  FixPass,
} from "@/components/illustrations";
import { SITE_NAME, CTA } from "@/lib/site";

export const metadata = {
  title: "How it works",
  description:
    "Drop in one line of script. We render your page in a real browser, check it the way assistive tech does, and hand you the exact fix for each issue.",
};

const checks = [
  {
    icon: Contrast,
    label: "Contrast",
    body: "Text and controls measured against their background — including pixel-level contrast where text sits over an image.",
  },
  {
    icon: Tags,
    label: "Names & labels",
    body: "Buttons, links, inputs, and icons checked for an accessible name a screen reader can announce.",
  },
  {
    icon: Keyboard,
    label: "Keyboard",
    body: "Every interactive thing reached and operated without a mouse, in an order that makes sense.",
  },
  {
    icon: AlignLeft,
    label: "Reading order",
    body: "We use on-screen geometry to check that the page reads in the order a person sees it.",
  },
  {
    icon: Eye,
    label: "Roles & structure",
    body: "Headings, landmarks, and roles checked so the page maps to a structure assistive tech can move through.",
  },
  {
    icon: ImageOff,
    label: "Images & alt text",
    body: "AI judges whether alt text is actually useful — and whether an image marked decorative really is.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      {/* Hero */}
      <Section ariaLabelledby="how-hero-title" className="pb-10 sm:pb-14">
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <Reveal>
              <h1
                id="how-hero-title"
                className="max-w-4xl text-4xl sm:text-6xl lg:text-7xl text-fg"
              >
                One script in. Real fixes out.
              </h1>
              <p className="mt-6 max-w-2xl text-lg sm:text-xl text-fg-soft">
                Add a single line to your site. When something ships, {SITE_NAME}{" "}
                renders the page in a real browser, checks it the way assistive
                tech actually experiences it, and tells you what&apos;s broken and
                how to fix it. No spreadsheets of jargon. Plain words and the
                exact change to make.
              </p>
            </Reveal>
            <Reveal delay={0.1} className="mt-8 flex flex-wrap gap-4">
              <Button href={CTA.primary.href} variant="blue" size="lg">
                {CTA.primary.label}
              </Button>
              <Button href="/features" variant="outline" size="lg">
                See what we check
              </Button>
            </Reveal>
          </div>
          <Reveal direction="left" delay={0.1}>
            <BrowserScan className="w-full" />
          </Reveal>
        </div>
      </Section>

      {/* The walkthrough */}
      <Section
        ariaLabelledby="steps-title"
        className="bg-surface/40 pt-6 sm:pt-10"
      >
        <SectionHeading
          id="steps-title"
          title="Scan, report, fix"
          lead="Four steps, start to finish. You do the first one once. The rest runs on its own every time your site changes."
        />

        <ol className="mt-12 space-y-8">
          {/* Step 1 — Install / trigger */}
          <Reveal as="li">
            <StepCard
              number={1}
              tone="yellow"
              icon={Code2}

              titleId="step-install"
              title="Drop in the script"
            >
              <p>
                Paste one line into your site&apos;s <code className="font-mono text-fg">&lt;head&gt;</code>.
                That&apos;s the whole install. From then on, {SITE_NAME} watches for
                changes — a deploy, a new page, an edit you pushed — and kicks
                off a scan on its own. No build step to wire up, no CI plugin to
                babysit.
              </p>
              <figure className="mt-2">
                <pre
                  className="overflow-x-auto border-[3px] border-[var(--ink)] bg-yellow p-4 shadow-ink"
                  tabIndex={0}
                  aria-label="Example embed script tag"
                >
                  <code className="font-mono text-sm leading-relaxed text-[var(--ink)]">
                    {`<script
  src="https://cdn.${SITE_NAME.toLowerCase()}.app/embed.js"
  data-site="your-site-id"
  defer
></script>`}
                  </code>
                </pre>
                <figcaption className="mt-2 text-sm text-fg-soft">
                  Illustrative. You&apos;ll get your real <code className="font-mono">data-site</code>{" "}
                  id when you sign up.
                </figcaption>
              </figure>
              <KeyboardNav className="mt-2 w-full max-w-sm" />
            </StepCard>
          </Reveal>

          {/* Step 2 — Scan */}
          <Reveal as="li">
            <StepCard
              number={2}
              tone="blue"
              icon={ScanLine}

              titleId="step-scan"
              title="We render and check the page for real"
            >
              <p>
                A change triggers a scan in the background. {SITE_NAME} opens the
                page in a real browser — fonts loaded, JavaScript run, images
                drawn — so we test the page a visitor actually gets, not a guess
                from the source.
              </p>
              <p>
                Then two passes. First the automated checks: contrast, accessible
                names, roles, keyboard operability, reading order worked out from
                where things land on screen, and contrast measured pixel by pixel
                where text overlaps an image. These are deterministic — same page,
                same result.
              </p>
              <p>
                Then the judgment calls, where rules alone fall short. AI reads
                the page in context: is this alt text actually useful, or does it
                just say <span className="italic">&ldquo;image&rdquo;</span>? Is this picture
                really decorative, or is it carrying meaning a screen-reader user
                would miss? We&apos;re upfront about which findings are measured and
                which are judged — both are labeled in the report.
              </p>
              <AssistiveWaves className="mt-2 w-full max-w-sm" />
            </StepCard>
          </Reveal>

          {/* Step 3 — Report */}
          <Reveal as="li">
            <StepCard
              number={3}
              tone="pink"
              icon={FileText}

              titleId="step-report"
              title="You get a report in plain words"
            >
              <p>
                Every finding spells out what&apos;s wrong, who it affects, and where
                it is on the page — in language you can read without a WCAG
                handbook open. Here&apos;s one finding, the way it&apos;d land in your
                report:
              </p>

              {/* Faux finding, built from divs */}
              <div
                className="mt-2 border-[3px] border-[var(--color-line)] bg-surface shadow-brut"
                role="group"
                aria-label="Example finding"
              >
                <div className="flex flex-wrap items-center gap-3 border-b-[3px] border-[var(--color-line)] bg-pink px-4 py-3">
                  <Badge className="!border-[var(--ink)]">
                    Blocking
                  </Badge>
                  <span className="font-display font-bold text-[var(--ink)]">
                    Button has no accessible name
                  </span>
                  <span className="ml-auto font-mono text-sm text-[var(--ink)]">
                    Automated
                  </span>
                </div>
                <div className="space-y-3 px-4 py-4 text-base text-fg">
                  <p>
                    <span className="font-bold">Where:</span>{" "}
                    <code className="font-mono text-sm">
                      header &gt; button.menu-toggle
                    </code>
                  </p>
                  <p>
                    <span className="font-bold">What&apos;s happening:</span> This
                    button only holds an icon. A screen reader announces it as
                    &ldquo;button&rdquo; with nothing else, so someone can&apos;t tell it opens the
                    menu.
                  </p>
                  <p className="border-t-[3px] border-[var(--color-line)] pt-3">
                    <span className="font-bold">Fix:</span> Give the button an
                    accessible name. Add{" "}
                    <code className="font-mono text-sm">{`aria-label="Open menu"`}</code>{" "}
                    to the button, or put visually-hidden text inside it.
                  </p>
                </div>
              </div>

              <p className="text-sm">
                No vague &ldquo;improve accessibility&rdquo; nudges. A specific issue, a
                specific place, a specific change.
              </p>
            </StepCard>
          </Reveal>

          {/* Step 4 — Fix */}
          <Reveal as="li">
            <StepCard
              number={4}
              tone="green"
              icon={Wrench}

              titleId="step-fix"
              title="Fix it, then let the re-scan confirm"
            >
              <p>
                Make the change. Push it. The next scan picks it up the same way
                the first one did, and the finding either clears or comes back
                with more detail. You&apos;re not left guessing whether it worked — the
                report tells you.
              </p>
              <p>
                Work through the blocking issues first, then the rest at your own
                pace. As your site grows, scans keep running and keep the report
                current.
              </p>
              <FixPass className="mt-2 w-full max-w-sm" />
            </StepCard>
          </Reveal>
        </ol>
      </Section>

      {/* What we check */}
      <Section ariaLabelledby="checks-title">
        <SectionHeading
          id="checks-title"
          title="What every scan looks at"
          lead="A mix of hard measurement and trained judgment — the same things assistive tech depends on to make a page usable."
        />
        <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {checks.map((c, i) => {
            const Icon = c.icon;
            return (
              <Reveal as="li" key={c.label} delay={i * 0.05}>
                <Card className="h-full">
                  <span
                    className="flex h-12 w-12 items-center justify-center border-[3px] border-[var(--color-line)] bg-surface text-fg"
                    aria-hidden="true"
                  >
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 text-xl text-fg">{c.label}</h3>
                  <p className="mt-2 text-base text-fg-soft">{c.body}</p>
                </Card>
              </Reveal>
            );
          })}
        </ul>
      </Section>

      {/* Notifications band */}
      <Section ariaLabelledby="notify-title">
        <Card tone="blue" className="sm:p-12">
          <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-center">
            <div>
              <h2
                id="notify-title"
                className="text-3xl sm:text-4xl text-on-accent"
              >
                It runs while you&apos;re doing something else
              </h2>
              <p className="mt-4 max-w-xl text-lg text-on-accent/90">
                Scans happen in the background. {SITE_NAME} pings you when it
                notices a change and again when the scan finishes — so an
                accessibility regression doesn&apos;t sit quietly in production for
                weeks. Set it once. Hear from it only when there&apos;s something to
                know.
              </p>
            </div>
            <div>
              <AssistiveWaves className="mb-6 w-full max-w-sm" />
              <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <BellRing
                  className="mt-1 h-6 w-6 shrink-0 text-on-accent"
                  aria-hidden="true"
                />
                <span className="text-on-accent">
                  Notified the moment a change triggers a fresh scan.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2
                  className="mt-1 h-6 w-6 shrink-0 text-on-accent"
                  aria-hidden="true"
                />
                <span className="text-on-accent">
                  Notified again when the scan completes, with the new findings.
                </span>
              </li>
              </ul>
            </div>
          </div>
        </Card>
      </Section>

      {/* CTA */}
      <Section ariaLabelledby="cta-title">
        <Card tone="yellow" className="text-center sm:p-14">
          <h2
            id="cta-title"
            className="mx-auto max-w-2xl text-3xl sm:text-5xl text-[var(--ink)]"
          >
            Ready to see what your site looks like to everyone?
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-[var(--ink)]">
            One line of script, one scan, and a report you can act on today.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Button href={CTA.primary.href} variant="blue" size="lg">
              {CTA.primary.label}
            </Button>
            <Button href="/features" variant="outline" size="lg">
              Browse the checks
            </Button>
          </div>
        </Card>
      </Section>
    </>
  );
}
