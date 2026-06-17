"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ConformanceFilterValue = "all" | "failures" | "manual";

const OPTIONS: { value: ConformanceFilterValue; label: string }[] = [
  { value: "all", label: "All criteria" },
  { value: "failures", label: "Failures" },
  { value: "manual", label: "Needs manual review" },
];

/**
 * Accessible segmented filter for the conformance checklist. The buttons toggle a CSS state on a
 * wrapping element via data-attributes, so the (server-rendered) document stays intact and only the
 * row visibility changes — keyboard-operable, color is never the sole signal (label + aria-pressed).
 *
 * Rows opt in by carrying `data-conformance-status` ("fail" | "pass" | "not-tested") and
 * `data-conformance-coverage` ("manual" | "partial" | "automatable"). The filter sets a
 * `data-filter` attribute on the wrapper; matching CSS lives inline below.
 */
export function ConformanceFilter({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<ConformanceFilterValue>("all");

  return (
    <div data-filter={value} className="conformance-scope">
      <style>{`
        .conformance-scope[data-filter="failures"] [data-conformance-status]:not([data-conformance-status="fail"]) { display: none; }
        .conformance-scope[data-filter="manual"] [data-conformance-coverage]:not([data-conformance-coverage="manual"]) { display: none; }
        /* "No matches" placeholders: hidden by default, revealed only when their filter empties a section. */
        .conformance-scope [data-empty-when] { display: none; }
        .conformance-scope[data-filter="failures"] [data-empty-when="failures"] { display: table-row; }
        .conformance-scope[data-filter="manual"] [data-empty-when="manual"] { display: table-row; }
        @media print {
          .conformance-scope[data-filter] [data-conformance-status],
          .conformance-scope[data-filter] [data-conformance-coverage] { display: revert !important; }
          .conformance-scope [data-empty-when] { display: none !important; }
        }
      `}</style>

      <div
        role="group"
        aria-label="Filter criteria"
        className="mb-5 inline-flex flex-wrap gap-1 rounded-xl border border-[var(--color-panel-line-strong)] bg-surface p-1 print:hidden"
      >
        {OPTIONS.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              onClick={() => setValue(opt.value)}
              className={cn(
                "min-h-[36px] rounded-lg px-3 py-1.5 text-sm font-bold transition-colors",
                active
                  ? "bg-[color-mix(in_srgb,var(--color-fg)_9%,transparent)] text-fg"
                  : "text-fg-soft hover:text-fg",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {children}
    </div>
  );
}
