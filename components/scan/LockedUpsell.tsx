import type { ComponentType } from "react";
import {
  Lock,
  Scale,
  Wand2,
  FileText,
  Sparkles,
  ScanEye,
  RefreshCw,
  FileCheck,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import type { UpsellTeasers } from "@/lib/upsell";

/**
 * The "what you'd unlock" surfaces for the anonymous public scan result. EVERYTHING here is derived
 * from the FREE deterministic findings (lib/upsell.ts) — no AI is ever run for an anonymous scan — so
 * the counts are real while the premium output stays locked. Two surfaces, two funnel steps:
 *
 *  - <LegalRiskTeaser> — the "what to fix first" legal-risk ranking. Free to compute, but locked here
 *    so the visitor signs up (free) to read it. CTA → /signup.
 *  - <ProFeatureGrid>  — the AI-powered fix workflow (written fixes, summary, builder prompt, vision,
 *    monitoring, artifacts). Reserved for Pro. CTA → /pricing.
 *
 * Accessibility (this is an accessibility product): the locked state is conveyed in TEXT ("Locked",
 * "Pro"), never colour or an icon alone; every icon is decorative (aria-hidden).
 */

/** A short locked-state tag. Text carries the meaning; colour is a redundant accent. */
function LockTag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 border-[3px] border-[var(--ink)] bg-bg px-2 py-0.5 text-xs font-bold uppercase tracking-wide font-display text-[var(--ink)]">
      <Lock className="size-3" strokeWidth={3} aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * The locked legal-risk "start here" teaser. Shows the REAL count of top-risk issues (deterministic),
 * with the ranked list itself obscured behind a free-account CTA.
 */
export function LegalRiskTeaser({ teasers }: { teasers: UpsellTeasers }) {
  const { totalIssues, topLegalRiskCount } = teasers;

  // Honest, count-driven hook with a graceful fallback when nothing ranks "high".
  const headline =
    topLegalRiskCount > 0
      ? `${topLegalRiskCount} of your ${totalIssues} issues are top legal risk`
      : "We ranked every issue by legal exposure";

  return (
    <section
      aria-labelledby="legal-teaser-title"
      className="mt-8 border-[3px] border-[var(--ink)] bg-surface p-5 shadow-ink sm:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center border-[3px] border-[var(--ink)] bg-pink text-[var(--ink)]"
          >
            <Scale className="size-5" strokeWidth={2.5} />
          </span>
          <div>
            <p className="font-display text-xs font-bold uppercase tracking-[0.12em] text-fg-soft">
              What to fix first
            </p>
            <h2 id="legal-teaser-title" className="mt-1 font-display text-xl font-bold text-fg">
              {headline}
            </h2>
          </div>
        </div>
        <LockTag label="Free account" />
      </div>

      <p className="mt-4 max-w-2xl text-fg leading-relaxed">
        We rank every finding by real-world legal exposure under the ADA and the European
        Accessibility Act — so you know which handful of issues actually draw a complaint, and which
        to fix first. The full ranked &ldquo;start here&rdquo; list is part of your free account.
      </p>

      {/* Obscured preview: implies the locked ranked list without revealing it. */}
      <ol aria-hidden="true" className="mt-5 flex flex-col gap-2.5 select-none">
        {[0, 1, 2].map((i) => (
          <li
            key={i}
            className="flex items-center gap-3 border-[3px] border-dashed border-[var(--color-line)] bg-bg p-3"
          >
            <span className="inline-flex size-6 shrink-0 items-center justify-center border-[3px] border-[var(--color-line)] text-xs font-bold tabular-nums text-fg-soft">
              {i + 1}
            </span>
            <span className="h-3 flex-1 rounded-sm bg-[color-mix(in_srgb,var(--color-fg)_14%,transparent)]" />
            <span className="inline-flex items-center gap-1.5 border-[3px] border-[var(--ink)] bg-pink/40 px-2 py-0.5 text-xs font-bold uppercase tracking-wide font-display text-[var(--ink)]">
              <Lock className="size-3" strokeWidth={3} />
              Top legal risk
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-5 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <Button href="/signup" variant="blue" size="md">
          Create your free account
        </Button>
        <p className="text-sm text-fg-soft">
          Free — see the ranked list and monitor your whole site, not just this page.
        </p>
      </div>
    </section>
  );
}

/** One locked Pro capability. `count`, when present, is the real deterministic number it would act on. */
type ProFeature = {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  desc: string;
  count?: string;
};

function ProCard({ feature }: { feature: ProFeature }) {
  const { icon: Icon, title, desc, count } = feature;
  return (
    <div className="flex flex-col gap-3 border-[3px] border-[var(--color-line)] bg-bg p-4">
      <div className="flex items-start justify-between gap-2">
        <span
          aria-hidden="true"
          className="inline-flex size-8 shrink-0 items-center justify-center border-[3px] border-[var(--color-line)] bg-surface text-fg"
        >
          <Icon className="size-4" strokeWidth={2.5} />
        </span>
        <LockTag label="Pro" />
      </div>
      <div>
        <p className="font-display font-bold text-fg">{title}</p>
        <p className="mt-1 text-sm text-fg-soft leading-relaxed">{desc}</p>
        {count ? (
          <p className="mt-2 font-display text-sm font-bold text-fg">{count}</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The locked Pro feature grid — the AI-powered fix workflow this anonymous scan deliberately did NOT
 * run. Counts come straight from the deterministic findings, so they're honest about what Pro would do.
 */
export function ProFeatureGrid({ teasers }: { teasers: UpsellTeasers }) {
  const { aiFixCount, visionImageCount } = teasers;

  const features: ProFeature[] = [
    {
      icon: Wand2,
      title: "AI-written fixes",
      desc: "A paste-ready before→after for each judgment-call issue — alt text, link wording, headings — written for you.",
      count:
        aiFixCount > 0
          ? `${aiFixCount} ${aiFixCount === 1 ? "issue" : "issues"} ready for an AI fix`
          : undefined,
    },
    {
      icon: FileText,
      title: "Plain-English summary",
      desc: "A non-technical executive summary of what's wrong, who it shuts out, and why it matters — no jargon.",
    },
    {
      icon: Sparkles,
      title: "AI-builder fix prompt",
      desc: "A copy-paste prompt that tells Cursor, v0 or Lovable exactly what to change to fix every issue.",
    },
    {
      icon: ScanEye,
      title: "Vision checks",
      desc: "Our vision AI looks at your images to catch alt text that doesn't match the picture and decorative images wrongly exposed.",
      count:
        visionImageCount > 0
          ? `${visionImageCount} ${visionImageCount === 1 ? "image" : "images"} to review`
          : undefined,
    },
    {
      icon: RefreshCw,
      title: "Monitoring & verification",
      desc: "We re-scan on every release, confirm your fixes actually landed, and alert you when something regresses.",
    },
    {
      icon: FileCheck,
      title: "Downloadable artifacts",
      desc: "An accessibility statement, a conformance certificate and a VPAT you can hand to customers and auditors.",
    },
  ];

  return (
    <section
      aria-labelledby="pro-features-title"
      className="mt-12 border-[3px] border-[var(--ink)] bg-surface p-5 shadow-ink sm:p-6"
    >
      <p className="font-display text-xs font-bold uppercase tracking-[0.12em] text-fg-soft">
        Locked on this free scan
      </p>
      <h2 id="pro-features-title" className="mt-1 font-display text-2xl font-bold text-fg">
        Turn findings into fixes with Pro
      </h2>
      <p className="mt-3 max-w-2xl text-fg leading-relaxed">
        This free scan finds the issues. Pro fixes them: AI-written corrections, a plain-English
        summary, continuous monitoring, and the compliance documents you can hand to customers.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <ProCard key={f.title} feature={f} />
        ))}
      </div>

      <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <Button href="/pricing" variant="yellow" size="md">
          See Pro plans
        </Button>
        <p className="text-sm text-fg-soft">
          Start with a free account — upgrade to Pro when you&apos;re ready to fix.
        </p>
      </div>
    </section>
  );
}
