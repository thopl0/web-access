"use client";

import { useActionState, useId, useState } from "react";
import { ArrowRight, Check } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Panel } from "@/components/dashboard/ui";
import { InstallInstructions } from "@/components/dashboard/InstallInstructions";
import { VerifyPanel } from "@/components/dashboard/VerifyPanel";
import { createSite, type SiteFormState } from "@/app/actions/sites";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3;
const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: "Name your site" },
  { n: 2, label: "Install the snippet" },
  { n: 3, label: "Verify" },
];

/** Stepper rail: numbered dots, completed ones get a check, the current one is highlighted. */
function Stepper({ step }: { step: Step }) {
  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((s, i) => {
        const done = step > s.n;
        const current = step === s.n;
        return (
          <li key={s.n} className="flex items-center gap-2">
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold",
                  done && "border-green bg-green text-on-accent",
                  current && "border-blue bg-blue text-on-accent",
                  !done && !current && "border-[var(--color-panel-line-strong)] text-fg-soft",
                )}
              >
                {done ? <Check className="size-4" strokeWidth={3} aria-hidden /> : s.n}
              </span>
              <span
                className={cn(
                  "hidden text-sm font-bold sm:inline",
                  current ? "text-fg" : "text-fg-soft",
                )}
              >
                {s.label}
              </span>
            </span>
            {i < STEPS.length - 1 ? (
              <span aria-hidden className="h-px w-6 bg-[var(--color-panel-line-strong)] sm:w-10" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export function SiteWizard() {
  const uid = useId();
  const fieldId = (name: string) => `${uid}-${name}`;
  const [step, setStep] = useState<Step>(1);
  const [created, setCreated] = useState<{ siteId: string; snippet: string } | null>(null);
  // Tracks which successful registration we've already advanced past, so we react to a NEW
  // success exactly once (see the render-time adjustment below).
  const [handledSiteId, setHandledSiteId] = useState<string | null>(null);

  const [state, formAction, pending] = useActionState<SiteFormState, FormData>(
    createSite,
    undefined,
  );

  // Adjust state during render (the React-sanctioned alternative to a setState-in-effect): when the
  // action returns a NEW created site, capture it and advance to the install step. React re-renders
  // immediately without committing the intermediate UI.
  if (state?.ok && state.siteId && state.snippet && state.siteId !== handledSiteId) {
    setHandledSiteId(state.siteId);
    setCreated({ siteId: state.siteId, snippet: state.snippet });
    setStep(2);
  }

  return (
    <div className="flex flex-col gap-6">
      <Stepper step={step} />

      {step === 1 ? (
        <Panel>
          <h2 className="font-display text-lg font-bold text-fg">Name your site</h2>
          <p className="mt-1 mb-5 text-sm text-fg-soft">
            We&apos;ll generate a unique site ID and a one-line script for it.
          </p>
          <form action={formAction} noValidate className="flex flex-col gap-5">
            <TextField
              id={fieldId("name")}
              name="name"
              label="Site name"
              type="text"
              required
              placeholder="My portfolio"
              hint="Just for you — how this site shows up in your list."
              error={state?.errors?.name?.[0]}
            />
            <TextField
              id={fieldId("origin")}
              name="origin"
              label="Site URL"
              type="url"
              required
              autoComplete="url"
              placeholder="https://example.com"
              hint="Your live site's address — we use it to verify the snippet and scan pages."
              error={state?.errors?.origin?.[0]}
            />
            <div>
              <Button type="submit" variant="blue" size="lg" disabled={pending}>
                {pending ? "Creating…" : "Continue"}
                {!pending ? <ArrowRight className="size-4" strokeWidth={2.5} aria-hidden /> : null}
              </Button>
            </div>
          </form>
        </Panel>
      ) : null}

      {step === 2 && created ? (
        <Panel>
          <h2 className="font-display text-lg font-bold text-fg">Install the snippet</h2>
          <p className="mt-1 mb-5 text-sm text-fg-soft">
            Add this one line to every page of your site — pick your platform for exact steps.
          </p>
          <InstallInstructions snippet={created.snippet} />
          <div className="mt-6 flex items-center justify-between gap-3 border-t border-[var(--color-panel-line)] pt-5">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="text-sm font-bold text-fg-soft hover:text-fg"
            >
              ← Back
            </button>
            <Button type="button" variant="blue" size="md" onClick={() => setStep(3)}>
              I&apos;ve added it
              <ArrowRight className="size-4" strokeWidth={2.5} aria-hidden />
            </Button>
          </div>
        </Panel>
      ) : null}

      {step === 3 && created ? (
        <Panel>
          <h2 className="font-display text-lg font-bold text-fg">Verify your install</h2>
          <p className="mt-1 mb-5 text-sm text-fg-soft">
            We&apos;ll confirm the snippet is live. This happens automatically on your site&apos;s
            first visit — or check now.
          </p>
          <VerifyPanel siteId={created.siteId} initialStatus="pending" hasOrigin />
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-panel-line)] pt-5">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="text-sm font-bold text-fg-soft hover:text-fg"
            >
              ← Back to install
            </button>
            <Button href={`/dashboard/${created.siteId}`} variant="outline" size="md">
              Go to site report
              <ArrowRight className="size-4" strokeWidth={2.5} aria-hidden />
            </Button>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
