"use client";

import { Printer } from "lucide-react";

/** Triggers the browser print dialog (users can "Save as PDF"). */
export function PrintButton({ label = "Print / Save as PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[var(--color-panel-line-strong)] bg-surface px-3 py-2 text-sm font-bold text-fg transition-colors hover:bg-[color-mix(in_srgb,var(--color-fg)_5%,transparent)] print:hidden"
    >
      <Printer className="size-4" strokeWidth={2.5} aria-hidden />
      {label}
    </button>
  );
}
