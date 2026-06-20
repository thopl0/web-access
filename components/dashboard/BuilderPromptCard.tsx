"use client";

import { useState } from "react";
import { Download, Loader2, Sparkles } from "lucide-react";

import { CopyButton } from "@/components/dashboard/CopyButton";
import { PLATFORMS, PLATFORM_LABELS, isPlatform, type Platform } from "@/lib/platform";

/**
 * Generate the paste-ready "fix everything" remediation message tailored to the owner's platform —
 * the product's distribution wedge. The owner picks their platform (AI builders get a copy-paste
 * PROMPT; CMS/site builders get numbered editor STEPS), generates, then copies or downloads it.
 *
 * The platform choice is persisted server-side as a side effect of generating: the GET route saves a
 * new, valid `?platform=` onto the site, so the picker remembers the owner's last choice on reload.
 *
 * Accessibility (this is an a11y product): the select is labelled, the trigger is a real button, and
 * the result region is an aria-live="polite" landmark so screen-reader users hear when it's ready.
 */
export function BuilderPromptCard({
  siteId,
  initialPlatform,
}: {
  siteId: string;
  initialPlatform: Platform;
}) {
  const [platform, setPlatform] = useState<Platform>(initialPlatform);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const href = `/api/sites/${siteId}/builder-prompt?platform=${encodeURIComponent(platform)}`;

  async function generate() {
    setLoading(true);
    setError(null);
    setPrompt(null);
    try {
      const res = await fetch(href);
      if (!res.ok) {
        const msg = await res.text();
        setError(msg || "Couldn't generate the prompt. Please try again.");
        return;
      }
      setPrompt(await res.text());
    } catch {
      setError("Couldn't generate the prompt. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor="builder-platform" className="font-bold text-fg">
          Your site builder
        </label>
        <select
          id="builder-platform"
          value={platform}
          onChange={(e) => {
            const next = e.target.value;
            // The option values come straight from PLATFORMS, so this is always a valid Platform.
            if (isPlatform(next)) setPlatform(next);
          }}
          className="min-h-[40px] w-full max-w-xs rounded-lg border border-[var(--color-panel-line-strong)] bg-surface px-3 py-2 text-sm font-bold text-fg"
        >
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {PLATFORM_LABELS[p]}
            </option>
          ))}
        </select>
        <p className="text-sm text-fg-soft">
          AI builders (Lovable, v0, Bolt, Replit, Cursor, Framer) get a single prompt you paste back
          in. CMS and site builders (Wix, WordPress, Webflow, Squarespace) get step-by-step editor
          instructions.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[var(--color-panel-line-strong)] bg-surface px-3 py-2 text-sm font-bold text-fg transition-colors hover:bg-[color-mix(in_srgb,var(--color-fg)_5%,transparent)] disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="size-4" strokeWidth={2.5} aria-hidden />
          )}
          {loading ? "Generating…" : "Generate prompt"}
        </button>
        <a
          href={href}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[var(--color-panel-line-strong)] bg-surface px-3 py-2 text-sm font-bold text-fg no-underline transition-colors hover:bg-[color-mix(in_srgb,var(--color-fg)_5%,transparent)]"
        >
          <Download className="size-4" strokeWidth={2.5} aria-hidden />
          Download (Markdown)
        </a>
      </div>

      {error ? (
        <p role="alert" className="text-sm font-bold text-pink">
          {error}
        </p>
      ) : null}

      <div aria-live="polite">
        {prompt ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display font-bold text-fg">
                Your {PLATFORM_LABELS[platform]} fix prompt
              </h3>
              <CopyButton text={prompt} label="Copy prompt" copiedLabel="Copied" />
            </div>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[var(--color-panel-line)] bg-surface px-4 py-3 font-mono text-xs text-fg">
              {prompt}
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}
