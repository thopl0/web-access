"use client";

import { useId, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ChevronDown, Code2, FileText, Layers, Loader2, MapPin, Sparkles, Zap } from "lucide-react";

import type { ElementBox, PageShot } from "@/lib/server/report";
import { cn } from "@/lib/utils";
import { AnnotatedShot } from "@/components/dashboard/AnnotatedShot";
import { CopyButton } from "@/components/dashboard/CopyButton";
import { Button } from "@/components/ui/Button";
import { applyCssFixesToIssue, applyFixesToIssue, approveRemediation, setRuntimeRemediation, type CssPatchInput, type PatchInput } from "@/app/actions/remediation";

/**
 * Serializable description of one offending element instance. The page builds
 * these on the server (so screenshots/boxes come pre-resolved) and hands them
 * to this client component, which owns all the interactive disclosure: pattern
 * vs. page grouping, the show-more cap, the per-spot "show code" toggle, and the
 * jump rail. No server-only imports here.
 */
export type SpotElement = {
  selector: string;
  htmlSnippet: string;
  crop?: string;
  cropWidth?: number;
  cropHeight?: number;
  box?: ElementBox;
  shot?: PageShot;
  explanation?: { title?: string; what: string; fix: string };
  /** Concrete before→after code fix for this element, when one could be generated. */
  fix?: {
    kind: "deterministic" | "ai";
    before: string;
    after: string;
    needsReview: boolean;
    note?: string;
    /** Structured safe-attribute form. Present => eligible to apply as a live fix. */
    attributePatch?: { attr: string; value: string }[];
    /** Experimental structured CSS form. Present => eligible to apply as a live CSS fix. */
    cssPatch?: { prop: string; value: string }[];
  };
  /** Concrete pages this element family spans (set when the page is collapsed). */
  urls?: string[];
};

/** A recurring element pattern — same selector + markup — across the whole site. */
export type SpotPattern = {
  id: string;
  /** How many concrete spots share this exact markup. */
  count: number;
  /** Page paths this pattern appears on (deduped, may be capped by the caller). */
  pagePaths: string[];
  /** Pages folded behind collapsed dynamic-route families, if any. */
  extraPages: number;
  /** The canonical example to show once. */
  example: SpotElement;
};

/** A page and the offending elements on it (the "by page" view). */
export type SpotPage = {
  id: string;
  path: string;
  grouped: boolean;
  pageCount: number;
  elements: SpotElement[];
};

type View = "pattern" | "page";

const PAGES_SHOWN = 6;

function ShowCode({ selector, snippet, idBase }: { selector: string; snippet: string; idBase: string }) {
  const [open, setOpen] = useState(false);
  const panelId = `${idBase}-code`;
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-panel-line-strong)] bg-surface px-2.5 py-1.5 text-xs font-bold text-fg-soft transition-colors hover:text-fg"
      >
        <Code2 className="size-3.5" aria-hidden strokeWidth={2.5} />
        {open ? "Hide code" : "Show code"}
        <ChevronDown
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
          aria-hidden
          strokeWidth={2.5}
        />
      </button>
      {open ? (
        <div id={panelId} className="mt-2">
          <p className="text-xs font-bold uppercase tracking-wide text-fg-soft">Code location</p>
          <code className="mt-1 block break-all text-sm text-fg">{selector}</code>
          <pre className="inset mt-2 overflow-x-auto p-2 text-sm text-fg">
            <code>{snippet}</code>
          </pre>
        </div>
      ) : null}
    </div>
  );
}

/** Element-specific AI explanation, clearly badged as distinct from the generic rule guidance. */
function AiExplanation({ explanation }: { explanation: NonNullable<SpotElement["explanation"]> }) {
  return (
    <div className="mt-3 rounded-lg border border-blue/30 bg-blue/5 p-3">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-blue">
        <Sparkles className="size-3.5" aria-hidden strokeWidth={2.5} />
        AI suggestion
      </p>
      {explanation.title ? <p className="mt-1.5 font-bold text-fg">{explanation.title}</p> : null}
      <p className="mt-1 text-sm text-fg">{explanation.what}</p>
      <p className="mt-1 text-sm text-fg">
        <span className="font-bold">Fix: </span>
        {explanation.fix}
      </p>
    </div>
  );
}

/** Strip a leading "TODO:" marker so placeholder text isn't mistaken for a real value. */
function stripTodo(value: string): string {
  return value.replace(/^\s*todo:?\s*/i, "");
}

/**
 * One "Apply as live fix" control for a single attribute patch. Owner-confirmed safe-attr patch that
 * the embed applies live. Placeholder ("TODO:") values force the owner to type a real value first;
 * non-review patches (lang="en", alt="") apply with one click. Honest about being a temporary patch.
 */
function ApplyPatch({
  siteId,
  ruleId,
  selector,
  patch,
  needsReview,
  runtimeEnabled,
}: {
  siteId: string;
  /** The issue's rule, so applying can auto-mark the issue "fixed" once every spot is covered. */
  ruleId?: string;
  selector: string;
  patch: { attr: string; value: string };
  needsReview: boolean;
  /** When false, applying first turns on the site's runtime-remediation master toggle (Pro-gated). */
  runtimeEnabled: boolean;
}) {
  const inputId = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Placeholder fixes ship a "TODO:" stand-in — the owner must supply the real value.
  const placeholder = needsReview;
  const [value, setValue] = useState(placeholder ? "" : patch.value);
  // For placeholder fixes, surface the cleaned suggestion as an input hint.
  const hint = placeholder ? stripTodo(patch.value) : "";

  const apply = () => {
    setError(null);
    startTransition(async () => {
      // First live fix on a site with the master toggle off: enable runtime remediation, then approve.
      // Both are Pro-gated server-side, so this stays one-click for Pro and blocked for everyone else.
      if (!runtimeEnabled) {
        const on = await setRuntimeRemediation(siteId, true);
        if (!on.ok) {
          setError(on.error ?? "Couldn't enable live fixes.");
          return;
        }
      }
      const res = await approveRemediation(siteId, { selector, attr: patch.attr, value }, ruleId);
      if (res.ok) {
        setApplied(true);
        router.refresh(); // reflect any "Fixed (live)" status change without a manual reload
      } else {
        setError(res.error ?? "Couldn't apply this fix.");
      }
    });
  };

  // Label nudges that the first apply also flips on live fixes for the whole site.
  const applyLabel = runtimeEnabled ? "Apply as live fix" : "Enable live fixes & apply";

  return (
    <div className="mt-3 rounded-lg border border-green/30 bg-green/5 p-3">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-green">
        <Zap className="size-3.5" aria-hidden strokeWidth={2.5} />
        Apply as live fix
      </p>
      <p className="mt-1 text-xs text-fg-soft">
        Applies instantly on your live site as a temporary patch — the real fix is to change your source.
        {runtimeEnabled ? null : " Applying turns on live fixes for this site."}
      </p>

      {placeholder ? (
        <div className="mt-2">
          <label htmlFor={inputId} className="text-xs font-bold text-fg">
            Value for <code className="text-fg-soft">{patch.attr}</code>
          </label>
          <input
            id={inputId}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={hint || "Enter a real value"}
            disabled={applied}
            className="mt-1 block w-full rounded-lg border border-[var(--color-panel-line-strong)] bg-surface px-2.5 py-1.5 text-sm text-fg"
          />
          {hint ? <p className="mt-1 text-xs text-fg-soft">Suggested: {hint}</p> : null}
        </div>
      ) : (
        <p className="mt-2 text-xs text-fg-soft">
          Sets <code className="text-fg">{patch.attr}={'"'}{patch.value}{'"'}</code>
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {applied ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-green" role="status">
            <Check className="size-4" aria-hidden strokeWidth={2.5} />
            Applied live
          </span>
        ) : (
          <Button type="button" variant="green" size="sm" onClick={apply} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {pending ? "Applying…" : applyLabel}
          </Button>
        )}
      </div>

      {error ? (
        <p role="alert" aria-live="assertive" className="mt-2 text-sm font-bold text-pink">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * EXPERIMENTAL "apply as live CSS fix" control for a spot's CSS patches (contrast / target-size). CSS
 * changes the page's appearance, so it's clearly flagged experimental; applying turns on the CSS
 * opt-in for the site (the labelled button is the owner's consent).
 */
function ApplyCss({
  siteId,
  ruleId,
  selector,
  patches,
  cssEnabled,
}: {
  siteId: string;
  ruleId?: string;
  selector: string;
  patches: { prop: string; value: string }[];
  /** Whether the site has already opted into experimental CSS fixes. */
  cssEnabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = () => {
    setError(null);
    startTransition(async () => {
      const input: CssPatchInput[] = patches.map((p) => ({ selector, prop: p.prop, value: p.value }));
      const res = await applyCssFixesToIssue(siteId, ruleId ?? "", input);
      if (res.ok) {
        setApplied(true);
        router.refresh();
      } else {
        setError(res.error ?? "Couldn't apply this CSS fix.");
      }
    });
  };

  return (
    <div className="mt-3 rounded-lg border border-yellow/40 bg-yellow/5 p-3">
      <p className="flex flex-wrap items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[color-mix(in_srgb,var(--color-fg)_75%,var(--yellow))]">
        <AlertTriangle className="size-3.5" aria-hidden strokeWidth={2.5} />
        Apply as live CSS fix
        <span className="rounded-full bg-yellow/25 px-2 py-0.5 text-[10px] normal-case text-[color-mix(in_srgb,var(--color-fg)_75%,var(--yellow))]">
          Experimental
        </span>
      </p>
      <p className="mt-1 text-xs text-fg-soft">
        Restyles the element on your live site to fix this. CSS changes can affect your design — review
        the result.{cssEnabled ? "" : " Applying turns on experimental CSS fixes for this site."}
      </p>
      <pre className="inset mt-2 overflow-x-auto p-2 text-xs text-fg">
        <code>{patches.map((p) => `${p.prop}: ${p.value};`).join("\n")}</code>
      </pre>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {applied ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-green" role="status">
            <Check className="size-4" aria-hidden strokeWidth={2.5} />
            Applied live
          </span>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={apply} disabled={pending} className="!border-yellow/60">
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {pending ? "Applying…" : cssEnabled ? "Apply CSS fix" : "Enable CSS fixes & apply"}
          </Button>
        )}
      </div>
      {error ? (
        <p role="alert" aria-live="assertive" className="mt-2 text-sm font-bold text-pink">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** No concrete fix could be generated for this spot — point to the AI builder prompt instead. */
function NoFixHint({ siteId }: { siteId: string }) {
  return (
    <p className="mt-3 text-xs text-fg-soft">
      No auto-fix for this one — use the{" "}
      <Link
        href={`/dashboard/${siteId}/reports`}
        className="font-bold text-link underline underline-offset-2"
      >
        AI builder prompt
      </Link>{" "}
      to resolve it in your source.
    </p>
  );
}

/** Concrete before→after code fix for one element: two code blocks, a copy button for the
 *  corrected markup, and a "needs review" badge for AI-generated or otherwise unverified fixes. */
export function FixBlock({
  fix,
  selector,
  siteId,
  ruleId,
  runtimeEnabled,
  cssEnabled = false,
}: {
  fix: NonNullable<SpotElement["fix"]>;
  selector: string;
  siteId: string;
  ruleId?: string;
  runtimeEnabled: boolean;
  /** Whether the site opted into experimental CSS fixes (drives the CSS apply control's label). */
  cssEnabled?: boolean;
}) {
  const canApply = Boolean(fix.attributePatch && fix.attributePatch.length > 0);
  const hasCss = Boolean(fix.cssPatch && fix.cssPatch.length > 0);
  // AI fixes are judgment calls; needsReview covers those plus deterministic placeholder inserts.
  const review = fix.kind === "ai" || fix.needsReview;
  return (
    <div className="mt-3 rounded-lg border border-[var(--color-panel-line)] bg-surface p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-blue">
          <Sparkles className="size-3.5" aria-hidden strokeWidth={2.5} />
          Suggested fix
        </p>
        {review ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-pink/15 px-2 py-0.5 text-xs font-bold text-pink">
            <AlertTriangle className="size-3 shrink-0" aria-hidden strokeWidth={2.5} />
            Needs review
          </span>
        ) : null}
      </div>

      <p className="text-xs font-bold uppercase tracking-wide text-fg-soft">Current</p>
      <pre className="inset mt-1 overflow-x-auto p-2 text-sm text-fg">
        <code>{fix.before}</code>
      </pre>

      <p className="mt-3 text-xs font-bold uppercase tracking-wide text-fg-soft">Should be</p>
      <pre className="inset mt-1 overflow-x-auto p-2 text-sm text-fg">
        <code>{fix.after}</code>
      </pre>

      {review && fix.note ? <p className="mt-2 text-xs text-fg-soft">{fix.note}</p> : null}

      <div className="mt-3">
        <CopyButton
          text={fix.after}
          label="Copy fixed code"
          copiedLabel="Code copied"
          className="text-xs"
        />
      </div>

      {/* Phase C: apply safe attribute patches live. When runtime is off, the apply control enables it
          first (Pro-gated) so the first live fix is one click — no detour to Settings. */}
      {canApply
        ? fix.attributePatch!.map((patch, i) => (
            <ApplyPatch
              key={`${patch.attr}-${i}`}
              siteId={siteId}
              ruleId={ruleId}
              selector={selector}
              patch={patch}
              needsReview={review}
              runtimeEnabled={runtimeEnabled}
            />
          ))
        : hasCss
          ? null // a CSS fix is offered below instead of the "can't auto-apply" hint
          : (
              // No machine-applicable fix (safe attr or CSS): apply it in source.
              <p className="mt-3 text-xs text-fg-soft">
                This fix can&apos;t be auto-applied to your live site — apply it in your source (copy above), or
                use the{" "}
                <Link
                  href={`/dashboard/${siteId}/reports`}
                  className="font-bold text-link underline underline-offset-2"
                >
                  AI builder prompt
                </Link>
                .
              </p>
            )}

      {/* Experimental CSS fix (contrast / target-size): a visual patch the embed applies live. */}
      {hasCss ? (
        <ApplyCss
          siteId={siteId}
          ruleId={ruleId}
          selector={selector}
          patches={fix.cssPatch!}
          cssEnabled={cssEnabled}
        />
      ) : null}
    </div>
  );
}

/**
 * One-click "fix every applyable spot of this issue". Each patch carries its own (AI-generated,
 * per-element) value, so this applies all of them at once via `applyFixesToIssue`, which also marks
 * the issue "Fixed (live)" when every spot ends up covered. Shown only when there are >1 applyable
 * spots (a single spot is already covered by its own Apply button).
 */
export function ApplyAllFixes({
  siteId,
  ruleId,
  patches,
  runtimeEnabled,
}: {
  siteId: string;
  ruleId: string;
  patches: PatchInput[];
  runtimeEnabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ applied: number; skipped: number; fixed: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = () => {
    setError(null);
    startTransition(async () => {
      const res = await applyFixesToIssue(siteId, ruleId, patches);
      if (res.ok) {
        setResult({ applied: res.applied ?? 0, skipped: res.skipped ?? 0, fixed: Boolean(res.fixed) });
        router.refresh();
      } else {
        setError(res.error ?? "Couldn't apply these fixes.");
      }
    });
  };

  return (
    <div className="rounded-lg border border-green/30 bg-green/5 p-3">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-green">
        <Zap className="size-3.5" aria-hidden strokeWidth={2.5} />
        Fix every spot at once
      </p>
      <p className="mt-1 text-xs text-fg-soft">
        Applies the suggested fix to all {patches.length} matching spots live — each with its own
        AI-generated value.{runtimeEnabled ? "" : " Applying turns on live fixes for this site."}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {result ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-green" role="status">
            <Check className="size-4" aria-hidden strokeWidth={2.5} />
            Applied {result.applied} live{result.fixed ? " · issue fixed" : ""}
            {result.skipped > 0 ? (
              <span className="font-normal text-fg-soft"> · {result.skipped} need a value or source change</span>
            ) : null}
          </span>
        ) : (
          <Button type="button" variant="green" size="sm" onClick={apply} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Zap className="size-4" aria-hidden strokeWidth={2.5} />}
            {pending ? "Applying…" : `Apply fix to all ${patches.length} spots`}
          </Button>
        )}
      </div>
      {error ? (
        <p role="alert" aria-live="assertive" className="mt-2 text-sm font-bold text-pink">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Bulk "apply the experimental CSS fix to every matching spot" — each spot keeps its own computed
 * value (e.g. a per-element contrast-compliant color). Mirrors ApplyAllFixes but for CSS patches.
 */
export function ApplyAllCss({
  siteId,
  ruleId,
  patches,
  cssEnabled,
}: {
  siteId: string;
  ruleId: string;
  patches: CssPatchInput[];
  cssEnabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ applied: number; fixed: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = () => {
    setError(null);
    startTransition(async () => {
      const res = await applyCssFixesToIssue(siteId, ruleId, patches);
      if (res.ok) {
        setResult({ applied: res.applied ?? 0, fixed: Boolean(res.fixed) });
        router.refresh();
      } else {
        setError(res.error ?? "Couldn't apply these CSS fixes.");
      }
    });
  };

  return (
    <div className="rounded-lg border border-yellow/40 bg-yellow/5 p-3">
      <p className="flex flex-wrap items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[color-mix(in_srgb,var(--color-fg)_75%,var(--yellow))]">
        <AlertTriangle className="size-3.5" aria-hidden strokeWidth={2.5} />
        Fix every spot with CSS
        <span className="rounded-full bg-yellow/25 px-2 py-0.5 text-[10px] normal-case">Experimental</span>
      </p>
      <p className="mt-1 text-xs text-fg-soft">
        Restyles all {patches.length} spots live to fix this — each with its own computed value. CSS
        changes can affect your design.{cssEnabled ? "" : " Applying turns on experimental CSS fixes."}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {result ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-green" role="status">
            <Check className="size-4" aria-hidden strokeWidth={2.5} />
            Applied {result.applied} live{result.fixed ? " · issue fixed" : ""}
          </span>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={apply} disabled={pending} className="!border-yellow/60">
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <AlertTriangle className="size-4" aria-hidden strokeWidth={2.5} />}
            {pending ? "Applying…" : `Apply CSS fix to all ${patches.length} spots`}
          </Button>
        )}
      </div>
      {error ? (
        <p role="alert" aria-live="assertive" className="mt-2 text-sm font-bold text-pink">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function PageList({ paths, extra }: { paths: string[]; extra: number }) {
  const SHOWN = 5;
  const shown = paths.slice(0, SHOWN);
  const more = paths.length - shown.length + extra;
  return (
    <p className="mt-2 text-xs text-fg-soft">
      <span className="font-bold">On: </span>
      <span className="break-all">{shown.join(", ")}</span>
      {more > 0 ? ` +${more} more` : ""}
    </p>
  );
}

function PatternCard({
  pattern,
  idBase,
  siteId,
  ruleId,
  runtimeEnabled,
  cssEnabled,
}: {
  pattern: SpotPattern;
  idBase: string;
  siteId: string;
  ruleId?: string;
  runtimeEnabled: boolean;
  cssEnabled: boolean;
}) {
  const ex = pattern.example;
  return (
    <article
      id={idBase}
      className="scroll-mt-24 rounded-xl border border-[var(--color-panel-line)] bg-surface p-4 sm:p-5"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--color-fg)_7%,transparent)] px-2.5 py-1 text-xs font-bold text-fg">
          <Layers className="size-3.5 text-fg-soft" aria-hidden strokeWidth={2.5} />
          {pattern.count === 1 ? "Appears once" : `Appears ${pattern.count}×`}
        </span>
        {pattern.count > 1 ? (
          <span className="text-xs font-bold text-fg-soft">same markup — fix once</span>
        ) : null}
      </div>

      <AnnotatedShot
        shot={ex.shot}
        box={ex.box}
        crop={ex.crop}
        cropWidth={ex.cropWidth}
        cropHeight={ex.cropHeight}
        label={`Screenshot of the affected element: ${ex.selector}`}
      />

      {ex.explanation ? <AiExplanation explanation={ex.explanation} /> : null}

      {ex.fix ? (
        <FixBlock fix={ex.fix} selector={ex.selector} siteId={siteId} ruleId={ruleId} runtimeEnabled={runtimeEnabled} cssEnabled={cssEnabled} />
      ) : (
        <NoFixHint siteId={siteId} />
      )}

      <PageList paths={pattern.pagePaths} extra={pattern.extraPages} />

      <ShowCode selector={ex.selector} snippet={ex.htmlSnippet} idBase={idBase} />
    </article>
  );
}

function PageCard({
  page,
  idBase,
  siteId,
  ruleId,
  runtimeEnabled,
  cssEnabled,
}: {
  page: SpotPage;
  idBase: string;
  siteId: string;
  ruleId?: string;
  runtimeEnabled: boolean;
  cssEnabled: boolean;
}) {
  return (
    <article
      id={idBase}
      className="scroll-mt-24 rounded-xl border border-[var(--color-panel-line)] bg-surface p-4 sm:p-5"
    >
      <p className="mb-1 flex flex-wrap items-center gap-2 font-display font-bold text-fg break-all">
        <MapPin className="size-4 shrink-0 text-fg-soft" aria-hidden strokeWidth={2.5} />
        {page.path}
        {page.grouped ? (
          <span className="text-xs font-normal text-fg-soft">{page.pageCount} pages (same route)</span>
        ) : null}
      </p>
      <p className="mb-3 text-xs text-fg-soft">
        {page.elements.length === 1 ? "1 spot" : `${page.elements.length} spots`} here
      </p>
      <ul className="flex flex-col gap-4">
        {page.elements.map((el, i) => (
          <li key={`${idBase}-${i}`} className="border-t border-[var(--inset-line)] pt-4 first:border-0 first:pt-0">
            <AnnotatedShot
              shot={el.shot}
              box={el.box}
              crop={el.crop}
              cropWidth={el.cropWidth}
              cropHeight={el.cropHeight}
              label={`Screenshot of the affected element: ${el.selector}`}
            />
            {el.explanation ? <AiExplanation explanation={el.explanation} /> : null}
            {el.fix ? (
              <FixBlock fix={el.fix} selector={el.selector} siteId={siteId} ruleId={ruleId} runtimeEnabled={runtimeEnabled} cssEnabled={cssEnabled} />
            ) : (
              <NoFixHint siteId={siteId} />
            )}
            <ShowCode selector={el.selector} snippet={el.htmlSnippet} idBase={`${idBase}-${i}`} />
          </li>
        ))}
      </ul>
    </article>
  );
}

export function IssueSpots({
  patterns,
  pages,
  totalSpots,
  siteId,
  ruleId,
  runtimeEnabled,
  cssEnabled = false,
}: {
  patterns: SpotPattern[];
  pages: SpotPage[];
  totalSpots: number;
  siteId: string;
  ruleId?: string;
  runtimeEnabled: boolean;
  cssEnabled?: boolean;
}) {
  const [view, setView] = useState<View>("pattern");
  const [shownPatterns, setShownPatterns] = useState(PAGES_SHOWN);
  const [shownPages, setShownPages] = useState(PAGES_SHOWN);
  const railId = useId();

  const items = view === "pattern" ? patterns : pages;
  const shown = view === "pattern" ? shownPatterns : shownPages;
  const setShown = view === "pattern" ? setShownPatterns : setShownPages;

  // Stable anchor ids for the rail + cards.
  const entries = useMemo(
    () =>
      view === "pattern"
        ? patterns.map((p, i) => ({
            anchor: `${railId}-pat-${i}`,
            label: p.example.selector,
            count: p.count,
          }))
        : pages.map((p, i) => ({ anchor: `${railId}-page-${i}`, label: p.path, count: p.elements.length })),
    [view, patterns, pages, railId],
  );

  const tabBtn = (v: View, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      onClick={() => setView(v)}
      aria-pressed={view === v}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold transition-colors",
        view === v
          ? "bg-[color-mix(in_srgb,var(--color-fg)_8%,transparent)] text-fg"
          : "text-fg-soft hover:text-fg",
      )}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <section aria-labelledby={`${railId}-heading`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2
          id={`${railId}-heading`}
          className="font-display text-sm font-bold uppercase tracking-wide text-fg-soft"
        >
          Where it appears
          <span className="ml-2 normal-case text-fg">
            {totalSpots} {totalSpots === 1 ? "spot" : "spots"} · {patterns.length}{" "}
            {patterns.length === 1 ? "pattern" : "patterns"} · {pages.length}{" "}
            {pages.length === 1 ? "page" : "pages"}
          </span>
        </h2>
        <div
          role="group"
          aria-label="Group spots by"
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-panel-line-strong)] bg-surface p-1"
        >
          {tabBtn("pattern", <Layers className="size-4" aria-hidden strokeWidth={2.5} />, "By pattern")}
          {tabBtn("page", <FileText className="size-4" aria-hidden strokeWidth={2.5} />, "By page")}
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-8">
        {/* Jump rail — wide screens only; the cards below are the source of truth on mobile. */}
        <nav
          aria-label="Jump to spot"
          className="sticky top-20 hidden max-h-[calc(100vh-6rem)] self-start overflow-y-auto lg:block"
        >
          <p className="mb-2 px-2 text-xs font-bold uppercase tracking-wide text-fg-soft">
            {view === "pattern" ? "Patterns" : "Pages"}
          </p>
          <ul className="flex flex-col gap-0.5">
            {entries.map((e) => (
              <li key={e.anchor}>
                <a
                  href={`#${e.anchor}`}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-fg-soft no-underline transition-colors hover:bg-[color-mix(in_srgb,var(--color-fg)_5%,transparent)] hover:text-fg"
                >
                  <span className="min-w-0 truncate font-mono text-xs">{e.label}</span>
                  <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--color-fg)_8%,transparent)] px-1.5 text-xs font-bold tabular-nums text-fg-soft">
                    {e.count}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Cards */}
        <div className="mt-4 flex flex-col gap-4 lg:mt-0">
          {view === "pattern"
            ? patterns.slice(0, shown).map((p, i) => (
                <PatternCard
                  key={`${railId}-pat-${i}`}
                  pattern={p}
                  idBase={`${railId}-pat-${i}`}
                  siteId={siteId}
                  ruleId={ruleId}
                  runtimeEnabled={runtimeEnabled}
                  cssEnabled={cssEnabled}
                />
              ))
            : pages.slice(0, shown).map((p, i) => (
                <PageCard
                  key={`${railId}-page-${i}`}
                  page={p}
                  idBase={`${railId}-page-${i}`}
                  siteId={siteId}
                  ruleId={ruleId}
                  runtimeEnabled={runtimeEnabled}
                  cssEnabled={cssEnabled}
                />
              ))}

          {items.length > shown ? (
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGES_SHOWN)}
              className="self-center rounded-lg border border-[var(--color-panel-line-strong)] bg-surface px-4 py-2 text-sm font-bold text-fg transition-colors hover:bg-[color-mix(in_srgb,var(--color-fg)_5%,transparent)]"
            >
              Show {Math.min(PAGES_SHOWN, items.length - shown)} more
              {view === "pattern" ? " patterns" : " pages"}
              <span className="ml-1 text-fg-soft">({items.length - shown} hidden)</span>
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
