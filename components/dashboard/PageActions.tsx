"use client";

import { useState, useTransition } from "react";
import { Loader2, RefreshCw, ScanLine } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { recrawlSite, rescanPage } from "@/app/actions/sites";

/** "Re-crawl" — re-discover the site's pages and queue fresh scans. */
export function RecrawlButton({ siteId }: { siteId: string }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);

  function run() {
    setDone(false);
    start(async () => {
      const res = await recrawlSite(siteId);
      if (res.ok) {
        setDone(true);
        window.setTimeout(() => setDone(false), 3000);
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={run} disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <RefreshCw className="size-4" strokeWidth={2.5} aria-hidden />
        )}
        {pending ? "Queuing…" : "Re-crawl"}
      </Button>
      <span role="status" aria-live="polite" className="text-xs font-bold text-green">
        {done ? "Crawl queued" : ""}
      </span>
    </span>
  );
}

/** "Rescan" a single monitored page. */
export function RescanButton({ siteId, url }: { siteId: string; url: string }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);

  function run() {
    setDone(false);
    start(async () => {
      const res = await rescanPage(siteId, url);
      if (res.ok) {
        setDone(true);
        window.setTimeout(() => setDone(false), 3000);
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-panel-line-strong)] px-2.5 py-1.5 text-xs font-bold text-fg-soft transition-colors hover:text-fg disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <ScanLine className="size-3.5" strokeWidth={2.5} aria-hidden />
        )}
        {pending ? "Queuing…" : "Rescan"}
      </button>
      <span role="status" aria-live="polite" className="text-xs font-bold text-green">
        {done ? "Queued" : ""}
      </span>
    </span>
  );
}
