"use client";

import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

/**
 * Compare control for the history diff. Two native selects (keyboard- and
 * screen-reader-friendly out of the box) that push `?from=&to=` onto the URL so
 * the server component re-renders the diff and the link stays shareable.
 *
 * Options are the snapshots themselves; `from` should be the earlier scan and
 * `to` the later one, but the server diffs chronologically regardless of order.
 */
export function CompareSelect({
  siteId,
  options,
  fromId,
  toId,
}: {
  siteId: string;
  options: { id: string; label: string }[];
  fromId: string;
  toId: string;
}) {
  const router = useRouter();

  function update(next: { from?: string; to?: string }) {
    const sp = new URLSearchParams();
    sp.set("from", next.from ?? fromId);
    sp.set("to", next.to ?? toId);
    router.push(`/dashboard/${siteId}/history?${sp.toString()}`);
  }

  const selectClass =
    "min-h-[40px] min-w-0 flex-1 rounded-lg border border-[var(--color-panel-line-strong)] bg-surface px-2.5 py-1 text-sm font-bold text-fg";

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-xs font-bold uppercase tracking-wide text-fg-soft">
          Compare from
        </span>
        <select
          value={fromId}
          onChange={(e) => update({ from: e.target.value })}
          className={selectClass}
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <ArrowRight
        className="hidden size-4 shrink-0 self-center text-fg-soft sm:mb-2.5 sm:block"
        aria-hidden
        strokeWidth={2.5}
      />

      <label className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-xs font-bold uppercase tracking-wide text-fg-soft">
          To
        </span>
        <select
          value={toId}
          onChange={(e) => update({ to: e.target.value })}
          className={selectClass}
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
