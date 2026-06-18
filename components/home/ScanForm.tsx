"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { AlertCircle, ScanLine } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { computeFingerprint } from "@/lib/fingerprint";
import { startPublicScan, type PublicScanState } from "@/app/actions/public-scan";

/**
 * Home-page "scan your site" box. Anonymous visitors drop a URL and get a live result page; the
 * Server Action enforces the free weekly limit. We compute a browser fingerprint after mount and
 * ship it in a hidden field as one of several anti-abuse signals (the action also keys on IP, a
 * first-party cookie, and the target domain).
 */
export function ScanForm() {
  const uid = useId();
  const inputId = `${uid}-url`;
  const errorId = `${uid}-error`;

  const [state, formAction, pending] = useActionState<PublicScanState, FormData>(
    startPublicScan,
    undefined,
  );
  const [fp, setFp] = useState("");

  useEffect(() => {
    let alive = true;
    computeFingerprint().then((v) => {
      if (alive) setFp(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  const error = state?.error;

  return (
    <form action={formAction} className="mt-8 w-full max-w-xl">
      <input type="hidden" name="fp" value={fp} />
      <label htmlFor={inputId} className="sr-only">
        Your website URL
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id={inputId}
          name="url"
          type="text"
          inputMode="url"
          autoComplete="url"
          required
          placeholder="yoursite.com"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={
            "min-h-[52px] flex-1 border-[3px] border-[var(--ink)] bg-surface px-4 py-3 text-base " +
            "text-fg shadow-ink placeholder:text-fg-soft/70 focus:outline-none " +
            "focus-visible:outline-3 focus-visible:outline-[var(--color-blue)] focus-visible:outline-offset-2 " +
            "aria-[invalid=true]:border-pink aria-[invalid=true]:bg-pink/10"
          }
        />
        <Button type="submit" variant="blue" size="lg" disabled={pending} className="shrink-0">
          <ScanLine className="size-5" strokeWidth={2.75} aria-hidden="true" />
          {pending ? "Starting…" : "Scan my site"}
        </Button>
      </div>

      <p className="mt-3 text-sm text-fg-soft">
        Free · no account · {/* limit is enforced server-side */}3 scans a week.
      </p>

      <p
        id={errorId}
        role="alert"
        aria-live="assertive"
        className="mt-2 min-h-[1.25rem] text-sm font-bold text-pink"
      >
        {error ? (
          <span className="inline-flex items-start gap-1.5">
            <AlertCircle className="mt-0.5 size-4 shrink-0" strokeWidth={2.75} aria-hidden="true" />
            {error}
          </span>
        ) : null}
      </p>
    </form>
  );
}
