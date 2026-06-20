"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { GoogleAnalytics } from "@next/third-parties/google";

import { Button } from "@/components/ui/Button";

/**
 * Cookie consent gate for Google Analytics. Until the visitor explicitly accepts, GA is NOT loaded at
 * all (no gtag.js request, no cookies) — the strictest reading of GDPR/ePrivacy: analytics is opt-IN,
 * and declining is as easy as accepting. The choice persists in localStorage so the banner shows once;
 * the footer's "Cookie settings" control re-opens it so consent can be changed or withdrawn.
 *
 * The stored choice is read through useSyncExternalStore (not an effect), so it's SSR-safe and there's
 * no banner flash on hydration: the server snapshot is "unknown" → we render nothing until the client
 * reads the real value. Accessibility (this is an accessibility product): the banner is a non-modal
 * labelled region (no focus trap), both choices are equal-weight real buttons, and re-opening it from
 * the footer moves focus to the banner so keyboard/screen-reader users land where they asked to be.
 */

const STORAGE_KEY = "wa-cookie-consent";
const CHANGED_EVENT = "wa:consent-changed";
const REOPEN_EVENT = "wa:cookie-settings";

/** "granted" | "denied" = a stored choice; "none" = no choice yet (client); "unknown" = SSR/pre-hydration. */
type Snapshot = "granted" | "denied" | "none" | "unknown";

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGED_EVENT, onChange);
  window.addEventListener("storage", onChange); // keep tabs in sync
  return () => {
    window.removeEventListener(CHANGED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): Snapshot {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "granted" || v === "denied" ? v : "none";
  } catch {
    return "none";
  }
}

const getServerSnapshot = (): Snapshot => "unknown";

export function CookieConsent({ gaId }: { gaId: string }) {
  const consent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // The banner shows when there's no stored choice, or when the visitor re-opens it from the footer.
  const [reopened, setReopened] = useState(false);
  const regionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const reopen = () => setReopened(true);
    window.addEventListener(REOPEN_EVENT, reopen);
    return () => window.removeEventListener(REOPEN_EVENT, reopen);
  }, []);

  // Move focus into the banner only when it was re-opened on purpose — never steal focus on first load.
  useEffect(() => {
    if (reopened) regionRef.current?.focus();
  }, [reopened]);

  const choose = useCallback(
    (value: "granted" | "denied") => {
      try {
        localStorage.setItem(STORAGE_KEY, value);
      } catch {
        /* storage blocked (private mode) — the dispatch below still updates this session */
      }
      // GA honours this flag, so if it loaded earlier this session a later "denied" stops it sending.
      (window as unknown as Record<string, boolean>)[`ga-disable-${gaId}`] = value === "denied";
      setReopened(false);
      window.dispatchEvent(new Event(CHANGED_EVENT));
    },
    [gaId],
  );

  const open = consent !== "unknown" && (consent === "none" || reopened);

  return (
    <>
      {consent === "granted" ? <GoogleAnalytics gaId={gaId} /> : null}

      {open ? (
        <div className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4">
          <section
            ref={regionRef}
            tabIndex={-1}
            aria-label="Cookie consent"
            className="mx-auto flex max-w-3xl flex-col gap-4 border-[3px] border-[var(--ink)] bg-surface p-4 shadow-ink-lg outline-none sm:flex-row sm:items-center sm:justify-between sm:p-5"
          >
            <p className="text-sm leading-relaxed text-fg">
              We use a couple of essential cookies to run the site, plus optional{" "}
              <strong className="font-semibold">Google Analytics</strong>{" "}cookies to see how
              it&apos;s used so we can improve it. You choose.{" "}
              <Link href="/privacy" className="font-bold text-link underline underline-offset-2">
                Privacy policy
              </Link>
              .
            </p>
            <div className="flex shrink-0 gap-3">
              <Button type="button" variant="outline" size="sm" onClick={() => choose("denied")}>
                Decline
              </Button>
              <Button type="button" variant="yellow" size="sm" onClick={() => choose("granted")}>
                Accept
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
