"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { SEVERITY_ORDER } from "@/lib/severity";
import { cn } from "@/lib/utils";

const VIEWS = [
  { id: "open", label: "Open" },
  { id: "fixed", label: "Auto-fixed" },
  { id: "muted", label: "Resolved / ignored" },
  { id: "all", label: "All" },
];

/** Inbox filters: a view segmented control + severity/site selects, all driven through the URL so
 *  the server component re-renders with the filtered list (and links stay shareable). */
export function IssueFilters({
  sites,
}: {
  sites: { id: string; name: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const view = params.get("view") ?? "open";
  const severity = params.get("severity") ?? "";
  const site = params.get("site") ?? "";

  function update(next: Record<string, string>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    router.push(`/dashboard/issues?${sp.toString()}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Issue view" className="flex flex-wrap gap-2">
        {VIEWS.map((v) => {
          const active = view === v.id;
          return (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => update({ view: v.id === "open" ? "" : v.id })}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-bold transition-colors",
                active
                  ? "border-[var(--ink)] bg-blue text-on-accent"
                  : "border-[var(--color-panel-line-strong)] text-fg-soft hover:text-fg",
              )}
            >
              {v.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-sm font-bold text-fg-soft">
          Severity
          <select
            value={severity}
            onChange={(e) => update({ severity: e.target.value })}
            className="min-h-[40px] rounded-lg border border-[var(--color-panel-line-strong)] bg-surface px-2 py-1 text-sm font-bold text-fg"
          >
            <option value="">All</option>
            {SEVERITY_ORDER.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </label>

        {sites.length > 1 ? (
          <label className="flex items-center gap-2 text-sm font-bold text-fg-soft">
            Site
            <select
              value={site}
              onChange={(e) => update({ site: e.target.value })}
              className="min-h-[40px] max-w-[200px] rounded-lg border border-[var(--color-panel-line-strong)] bg-surface px-2 py-1 text-sm font-bold text-fg"
            >
              <option value="">All sites</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </div>
  );
}
