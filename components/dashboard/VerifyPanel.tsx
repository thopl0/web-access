"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, CircleAlert, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { checkInstall, getVerificationStatus } from "@/app/actions/sites";
import type { SiteStatus } from "@web-access/shared";

const POLL_MS = 4000;

/**
 * The hybrid verification surface. While a site is unverified it (a) polls the server for a passive
 * embed ping and (b) offers a "Check now" button that actively fetches the site and looks for the
 * snippet — whichever lands first flips the panel to its success state. Reused by the onboarding
 * wizard (which passes onVerified to advance) and anywhere a site still needs installing.
 */
export function VerifyPanel({
  siteId,
  initialStatus,
  hasOrigin,
  onVerified,
}: {
  siteId: string;
  initialStatus: SiteStatus;
  hasOrigin: boolean;
  /** Called once when the site transitions to verified (active check or passive ping). */
  onVerified?: () => void;
}) {
  const [status, setStatus] = useState<SiteStatus>(initialStatus);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const notified = useRef(false);
  const verified = status === "verified";

  // Fire onVerified exactly once.
  useEffect(() => {
    if (verified && !notified.current) {
      notified.current = true;
      onVerified?.();
    }
  }, [verified, onVerified]);

  // Passive poll: catch the first embed ping without the user clicking anything.
  useEffect(() => {
    if (verified) return;
    let active = true;
    const id = setInterval(() => {
      void getVerificationStatus(siteId)
        .then((res) => {
          if (active && res.status === "verified") setStatus("verified");
        })
        .catch(() => {
          /* transient — keep polling */
        });
    }, POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [siteId, verified]);

  function check() {
    setMessage(null);
    startTransition(async () => {
      const res = await checkInstall(siteId);
      setStatus(res.status);
      if (!res.verified) setMessage(res.message);
    });
  }

  if (verified) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-green/40 bg-green/10 px-4 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-green text-on-accent">
          <Check className="size-5" strokeWidth={3} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-display font-bold text-fg">Snippet detected — you&apos;re all set</p>
          <p className="text-sm text-fg-soft">
            We&apos;ll scan each release automatically. Reports appear here as scans complete.
          </p>
        </div>
        <span role="status" aria-live="polite" className="sr-only">
          Snippet detected. Verification complete.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm text-fg-soft">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Waiting for the snippet to go live…
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="blue" size="sm" onClick={check} disabled={pending || !hasOrigin}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="size-4" strokeWidth={2.5} aria-hidden />
          )}
          {pending ? "Checking…" : "Check now"}
        </Button>
        {!hasOrigin ? (
          <span className="text-xs text-fg-soft">Add a site URL to check it automatically.</span>
        ) : (
          <span className="text-xs text-fg-soft">…or we&apos;ll detect it on the first visit.</span>
        )}
      </div>
      {message ? (
        <p className="flex items-start gap-2 text-sm text-pink">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {message}
        </p>
      ) : null}
    </div>
  );
}
