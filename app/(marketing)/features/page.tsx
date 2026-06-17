import {
  Eye,
  ScanLine,
  ListOrdered,
  Keyboard,
  Image as ImageIcon,
  Sparkles,
  Hand,
  MessageSquareText,
  RotateCcw,
  Code2,
  Bell,
  ShieldCheck,
  GitBranch,
} from "lucide-react";

import { Section, SectionHeading } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Reveal } from "@/components/motion/Reveal";
import {
  BrowserScan,
  AssistiveWaves,
  ContrastEye,
  KeyboardNav,
  FindingsReport,
} from "@/components/illustrations";
import { LabelExample } from "@/components/features/LabelExample";
import { ContrastExample } from "@/components/features/ContrastExample";
import { SITE_NAME, CTA } from "@/lib/site";

export const metadata = {
  title: "Features",
  description:
    "How the scanner sees your page like a real person does, catches what generic checkers miss, and hands you a specific fix for every issue it finds.",
};

type FeatureCardProps = {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  tone: "surface" | "yellow" | "pink" | "blue" | "green";
  title: string;
  children: React.ReactNode;
  badge?: React.ReactNode;
};

function FeatureCard({ icon: Icon, tone, title, children, badge }: FeatureCardProps) {
  const onAccent = tone === "blue" || tone === "green";
  const iconBox = onAccent
    ? "border-on-accent/40 text-on-accent"
    : tone === "surface"
      ? "border-[var(--color-line)] text-fg"
      : "border-[var(--ink)] text-[var(--ink)]";
  const body = onAccent ? "text-on-accent/90" : tone === "surface" ? "text-fg-soft" : "text-[var(--ink)]/80";

  return (
    <Card tone={tone} className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <span
          aria-hidden="true"
          className={`inline-flex size-11 shrink-0 items-center justify-center border-[3px] ${iconBox}`}
        >
          <Icon className="size-5" strokeWidth={2.5} />
        </span>
        {badge ?? null}
      </div>
      <h3 className="font-display text-xl sm:text-2xl">{title}</h3>
      <p className={`text-base leading-relaxed ${body}`}>{children}</p>
    </Card>
  );
}

export default function FeaturesPage() {
  return (
    <>
      {/* Hero */}
      <Section ariaLabelledby="features-hero-title">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
          <div>
            <h1
              id="features-hero-title"
              className="text-4xl sm:text-5xl lg:text-6xl text-fg"
            >
              Every check {SITE_NAME} runs, and why it catches the stuff you&apos;d miss.
            </h1>
            <p className="mt-5 text-lg sm:text-xl text-fg-soft max-w-2xl">
              It loads your page in a real browser, walks it the way someone using
              a screen reader or a keyboard would, and reports back in plain words.
              No jargon dump. Each finding comes with the exact change to make.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Button href={CTA.primary.href} variant="blue" size="lg">
                {CTA.primary.label}
              </Button>
              <Button href="/how-it-works" variant="outline" size="lg">
                See how it works
              </Button>
            </div>
          </div>
          <Reveal direction="left" className="lg:justify-self-end">
            <BrowserScan className="w-full max-w-md" />
          </Reveal>
        </div>
      </Section>

      {/* Band 1 — Sees the page like a person does */}
      <Section ariaLabelledby="render-title" className="bg-surface">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
          <SectionHeading
            id="render-title"
            title="Sees the page like a person does"
            lead="Static checkers read your source. People don't. The scanner runs the page in a real browser, after your scripts and styles settle, then experiences it the way assistive tech would."
          />
          <Reveal direction="left" className="lg:justify-self-end">
            <AssistiveWaves className="w-full max-w-sm" />
          </Reveal>
        </div>
        <Reveal className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-2">
          <FeatureCard icon={ScanLine} tone="blue" title="A real browser, fully rendered">
            Your page runs end to end before anything is checked — fonts loaded,
            JavaScript done, the DOM in the state a visitor actually lands on. A
            framework that builds the page on the client gets tested as the
            person sees it, not as the empty shell it ships as.
          </FeatureCard>
          <FeatureCard icon={Eye} tone="surface" title="Built around assistive tech">
            The checks mirror what a screen reader announces and what it skips —
            roles, accessible names, the order things get read. If a control is
            invisible to that experience, you hear about it.
          </FeatureCard>
          <FeatureCard icon={ListOrdered} tone="surface" title="Reading order that follows the eye">
            It measures where elements actually sit on screen and compares that
            to the order they live in the DOM. When a sidebar reads before the
            headline, or a caption lands before its image, the geometry gives it
            away.
          </FeatureCard>
          <FeatureCard icon={Keyboard} tone="yellow" title="Keyboard and focus order">
            Tab through the page and the focus should move somewhere sensible and
            stay visible. The scanner tracks where focus goes, flags traps, and
            catches controls a keyboard can never reach.
          </FeatureCard>
        </Reveal>
      </Section>

      {/* Band 2 — Catches what generic checkers miss */}
      <Section ariaLabelledby="deeper-title">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
          <SectionHeading
            id="deeper-title"
            title="Catches what generic checkers miss"
            lead="Plenty of tools tick boxes a linter could tick. The interesting failures live where you need to look at pixels, or actually judge whether something is right."
          />
          <Reveal direction="left" className="lg:justify-self-end">
            <ContrastEye className="w-full max-w-sm" />
          </Reveal>
        </div>

        <Reveal className="mt-10 grid gap-6 lg:grid-cols-3">
          <FeatureCard icon={ImageIcon} tone="surface" title="Contrast over images, not guesses">
            Text on a flat color is the easy case. Text over a photo or a
            gradient is where readability quietly breaks. The scanner samples the
            actual pixels behind each glyph and measures the contrast there, so a
            caption sitting on a busy hero gets caught.
          </FeatureCard>
          <FeatureCard
            icon={Sparkles}
            tone="surface"
            title="Judgment on alt text and decorative images"
            badge={<Badge>Coming soon</Badge>}
          >
            A box-ticker is happy the moment an <code className="font-mono text-fg">alt</code>{" "}
            attribute exists, even if it reads &ldquo;image123.jpg&rdquo;. A
            vision model looks at the picture and the words and asks the real
            question: does this describe what&apos;s there — and is the image
            you marked decorative actually carrying meaning?
          </FeatureCard>
          <FeatureCard icon={Hand} tone="surface" title="Touch targets you can hit">
            On a phone, a tap zone smaller than a fingertip means missed taps and
            quiet frustration. The scanner measures rendered hit areas and flags
            the ones too small or too crowded to land reliably.
          </FeatureCard>
        </Reveal>

        {/* Concrete example — contrast over an image */}
        <Reveal className="mt-12" delay={0.05}>
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="font-display text-xl sm:text-2xl">
                Same banner, sampled behind the text
              </h3>
              <Badge>Live measure</Badge>
            </div>
            <p className="mt-3 max-w-2xl text-fg-soft">
              Both labels read &ldquo;Free shipping today&rdquo; over the same
              band. One clears the AA threshold; the pale one doesn&apos;t come
              close. The numbers are what the scanner reports.
            </p>
            <div className="mt-6">
              <ContrastExample />
            </div>
          </Card>
        </Reveal>
      </Section>

      {/* Band 3 — Findings you can actually act on */}
      <Section ariaLabelledby="findings-title" className="bg-surface">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
          <SectionHeading
            id="findings-title"
            title="Findings you can actually act on"
            lead="A list of WCAG codes helps nobody who doesn't already speak WCAG. Every finding is written for a developer who wants to ship the page right and move on."
          />
          <Reveal direction="left" className="lg:justify-self-end">
            <KeyboardNav className="w-full max-w-sm" />
          </Reveal>
        </div>

        <Reveal className="mt-10 grid gap-6 sm:grid-cols-2">
          <FeatureCard icon={MessageSquareText} tone="green" title="Plain words, then the exact change">
            Each issue says what&apos;s wrong, who it blocks, and the precise
            edit to make — the attribute to add, the value to use, the element to
            move. Copy it, paste it, done. No spec-reading homework.
          </FeatureCard>
          <FeatureCard icon={RotateCcw} tone="surface" title="Re-scan to confirm the fix">
            Made the change? Run it again and watch the finding clear. You get a
            straight answer that the fix landed, not a hunch.
          </FeatureCard>
        </Reveal>

        {/* Concrete example — unlabeled vs labeled control */}
        <Reveal className="mt-12" delay={0.05}>
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="font-display text-xl sm:text-2xl">
                One icon button, before and after
              </h3>
              <Badge>Example finding</Badge>
            </div>
            <p className="mt-3 max-w-2xl text-fg-soft">
              An icon-only delete control with no accessible name reads as a bare
              &ldquo;button&rdquo;. Here&apos;s the finding and the one-line fix it
              hands back.
            </p>
            <div className="mt-6">
              <LabelExample />
            </div>
          </Card>
        </Reveal>
      </Section>

      {/* Band 4 — Fits how you ship */}
      <Section ariaLabelledby="ship-title">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
          <SectionHeading
            id="ship-title"
            title="Fits how you ship"
            lead="One line of script, then it stays out of your way until something changes. No new dashboard to babysit, no audit to schedule."
          />
          <Reveal direction="left" className="lg:justify-self-end">
            <FindingsReport className="w-full max-w-sm" />
          </Reveal>
        </div>

        <Reveal className="mt-10 grid gap-6 lg:grid-cols-2">
          <FeatureCard icon={Code2} tone="blue" title="One line to embed">
            Drop a single script tag in your site and you&apos;re wired up. No
            build step, no SDK to learn, no config file to argue with.
          </FeatureCard>
          <FeatureCard icon={GitBranch} tone="surface" title="Auto-triggers on change">
            When the page changes, the scanner notices and queues a fresh run on
            its own. The accessibility check rides along with your edits instead
            of waiting for someone to remember it.
          </FeatureCard>
          <FeatureCard icon={Bell} tone="green" title="Background scans, then a ping">
            Scans run in the background and queue up so nothing blocks your page.
            You get a notification when a change is detected and again when the
            results are ready.
          </FeatureCard>
          <FeatureCard icon={ShieldCheck} tone="surface" title="Results only, raw render discarded">
            It keeps the findings and the cropped, masked evidence — the snippet
            that proves the issue. The full render of your page gets thrown away
            once the check is done. Less of your site sitting on someone
            else&apos;s disk.
          </FeatureCard>
        </Reveal>
      </Section>

      {/* Here now / coming next */}
      <Section ariaLabelledby="roadmap-title" className="bg-surface">
        <SectionHeading
          id="roadmap-title"
          level={2}
          title="Here now, and coming next"
          lead="No vaporware. Here's the honest split of what runs today versus what's on the way."
        />
        <Reveal className="mt-10 grid gap-6 sm:grid-cols-2">
          <Card className="flex flex-col gap-4">
            <Badge>Here now</Badge>
            <h3 className="font-display text-xl sm:text-2xl">The automated layer</h3>
            <p className="text-fg-soft leading-relaxed">
              Real-browser rendering, contrast (flat and over images), missing
              and empty labels, ARIA roles, keyboard and focus order, reading
              order by geometry, touch-target sizing — plus plain-language
              findings with specific fixes, background scans, and notifications.
            </p>
          </Card>
          <Card className="flex flex-col gap-4">
            <Badge>Coming next</Badge>
            <h3 className="font-display text-xl sm:text-2xl">Deeper AI and one-click fixes</h3>
            <p className="text-fg-soft leading-relaxed">
              Vision-model judgment on whether alt text is meaningful and whether
              a &ldquo;decorative&rdquo; image really is — and one-click
              remediation that applies the fix for you instead of leaving it as a
              to-do. We&apos;ll ship these as they earn their keep, not before.
            </p>
          </Card>
        </Reveal>
      </Section>

      {/* CTA band */}
      <Section ariaLabelledby="features-cta-title" className="bg-bg">
        <Reveal>
          <Card tone="green" className="text-center">
            <h2
              id="features-cta-title"
              className="font-display text-3xl sm:text-4xl lg:text-5xl"
            >
              Point it at a page and see what it finds.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-on-accent/90">
              Your first scan is free. You&apos;ll have a list of real issues —
              and the fixes — in a couple of minutes.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Button href={CTA.primary.href} variant="yellow" size="lg">
                {CTA.primary.label}
              </Button>
              <Button href="/pricing" variant="outline" size="lg">
                See pricing
              </Button>
            </div>
          </Card>
        </Reveal>
      </Section>
    </>
  );
}
