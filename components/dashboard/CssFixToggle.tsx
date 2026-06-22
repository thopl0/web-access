"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

import { setCssRemediation } from "@/app/actions/remediation";

/**
 * Master opt-in for EXPERIMENTAL CSS fixes. Separate from the non-visual runtime toggle because CSS
 * fixes change the page's appearance — clearly flagged as experimental and reversible.
 */
export function CssFixToggle({
  siteId,
  initialEnabled,
}: {
  siteId: string;
  initialEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    setError(null);
    start(async () => {
      const res = await setCssRemediation(siteId, next);
      if (!res.ok) {
        setEnabled(!next);
        setError(res.error ?? "Couldn't update CSS fixes.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex cursor-pointer items-start gap-3 font-bold text-fg">
        <input
          type="checkbox"
          checked={enabled}
          onChange={toggle}
          disabled={pending}
          className="mt-0.5 size-5 shrink-0 accent-[var(--color-blue)]"
        />
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            Apply experimental CSS fixes to my live site
            <span className="rounded-full bg-yellow/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[color-mix(in_srgb,var(--color-fg)_75%,var(--yellow))]">
              Experimental
            </span>
            {pending ? <Loader2 className="size-4 animate-spin text-fg-soft" aria-hidden /> : null}
          </span>
          <span className="mt-1 block text-xs font-normal text-fg-soft">
            Lets approved CSS fixes (e.g. color contrast and tap-target size) apply to your live site.
            These change how your pages look and <strong>can affect your design</strong> — review your
            site after enabling. The real fix is still to change your source.
          </span>
        </span>
      </label>
      <div className="flex items-start gap-2 rounded-lg border border-yellow/40 bg-yellow/5 px-3 py-2 text-xs text-fg-soft">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[color-mix(in_srgb,var(--color-fg)_75%,var(--yellow))]" aria-hidden strokeWidth={2.5} />
        Turning this off instantly stops serving every CSS fix (your approved fixes are kept).
      </div>
      {error ? (
        <p role="alert" className="text-sm font-bold text-pink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
