"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * While a public scan is queued/running, re-render the (server) result page on an interval so it
 * flips to the finished report on its own. Plain router.refresh() — no client data fetching. Gives
 * up after a bounded number of attempts so a stuck scan doesn't poll forever.
 */
export function ScanPoller({ intervalMs = 2500, maxAttempts = 80 }: { intervalMs?: number; maxAttempts?: number }) {
  const router = useRouter();
  const attempts = useRef(0);

  useEffect(() => {
    const id = setInterval(() => {
      attempts.current += 1;
      if (attempts.current > maxAttempts) {
        clearInterval(id);
        return;
      }
      router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs, maxAttempts]);

  return null;
}
