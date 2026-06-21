"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import {
  removeRemediation,
  setRemediationEnabled,
  setRuntimeRemediation,
  type ApprovedRemediation,
} from "@/app/actions/remediation";

/**
 * Phase C runtime remediation — owner-facing settings. The master toggle gates whether ANY approved
 * patch is ever served; below it, the list of approved fixes can each be paused or removed. Honesty
 * is load-bearing: the copy makes clear this is a temporary patch, not a replacement for fixing the
 * source, and that only explicitly approved fixes are ever applied.
 */
export function RuntimeFixSettings({
  siteId,
  initialEnabled,
  remediations,
}: {
  siteId: string;
  initialEnabled: boolean;
  remediations: ApprovedRemediation[];
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [list, setList] = useState<ApprovedRemediation[]>(remediations);
  const [error, setError] = useState<string | null>(null);
  const [togglePending, startToggle] = useTransition();

  function toggleMaster() {
    const next = !enabled;
    setEnabled(next);
    setError(null);
    startToggle(async () => {
      const res = await setRuntimeRemediation(siteId, next);
      if (!res.ok) {
        setEnabled(!next);
        setError(res.error ?? "Couldn't update runtime fixes.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-3 font-bold text-fg">
          <input
            type="checkbox"
            checked={enabled}
            onChange={toggleMaster}
            disabled={togglePending}
            className="size-5 accent-[var(--color-blue)]"
          />
          Apply approved fixes to my live site
          {togglePending ? (
            <Loader2 className="size-4 animate-spin text-fg-soft" aria-hidden />
          ) : null}
        </label>
        <p className="text-sm text-fg-soft">
          With this on, the snippet adds the accessibility attributes you&apos;ve approved (labels,
          alt text, language, roles) to your pages as they load. This is a temporary patch — it
          changes nothing visually and never replaces fixing the source, which stays the real fix.
          Only fixes you explicitly approve are ever applied.
        </p>
        {error ? (
          <p role="alert" className="text-sm font-bold text-pink">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 border-t border-[var(--color-panel-line)] pt-5">
        <h3 className="font-display font-bold text-fg">Approved fixes</h3>
        {list.length === 0 ? (
          enabled ? (
            <p className="text-sm text-fg-soft">
              Live fixes are on —{" "}
              <Link
                href={`/dashboard/${siteId}/issues`}
                className="font-bold text-link underline underline-offset-2"
              >
                approve a fix from your issues
              </Link>{" "}
              to apply it.
            </p>
          ) : (
            <p className="text-sm text-fg-soft">
              No fixes approved yet.{" "}
              <Link
                href={`/dashboard/${siteId}/issues`}
                className="font-bold text-link underline underline-offset-2"
              >
                Approve a fix from any issue&apos;s detail page
              </Link>{" "}
              to add it here.
            </p>
          )
        ) : (
          <>
            {!enabled ? (
              <p className="text-sm text-fg-soft">Turn on runtime fixes above to apply these.</p>
            ) : null}
            <ul className="flex flex-col gap-3">
              {list.map((rem) => (
                <RemediationRow
                  key={rem.id}
                  rem={rem}
                  masterEnabled={enabled}
                  onToggle={(next) =>
                    setList((prev) =>
                      prev.map((r) => (r.id === rem.id ? { ...r, enabled: next } : r)),
                    )
                  }
                  onRemove={() => setList((prev) => prev.filter((r) => r.id !== rem.id))}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

/** A single approved remediation: its selector + attr/value, an enable/disable toggle, and remove. */
function RemediationRow({
  rem,
  masterEnabled,
  onToggle,
  onRemove,
}: {
  rem: ApprovedRemediation;
  masterEnabled: boolean;
  onToggle: (next: boolean) => void;
  onRemove: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const next = !rem.enabled;
    setError(null);
    start(async () => {
      const res = await setRemediationEnabled(rem.id, next);
      if (res.ok) {
        onToggle(next);
      } else {
        setError(res.error ?? "Couldn't update this fix.");
      }
    });
  }

  function remove() {
    setError(null);
    start(async () => {
      const res = await removeRemediation(rem.id);
      if (res.ok) {
        onRemove();
      } else {
        setError(res.error ?? "Couldn't remove this fix.");
      }
    });
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-[var(--color-panel-line)] bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex min-w-0 flex-1 items-center gap-3 text-fg">
          <input
            type="checkbox"
            checked={rem.enabled}
            onChange={toggle}
            disabled={pending}
            className="size-5 shrink-0 accent-[var(--color-blue)]"
          />
          <span className="min-w-0 flex-1">
            <code className="block truncate font-mono text-xs text-fg-soft">{rem.selector}</code>
            <code className="block truncate font-mono text-sm text-fg">
              {rem.attr} = &quot;{rem.value}&quot;
            </code>
          </span>
        </label>
        <div className="flex shrink-0 items-center gap-2">
          {pending ? <Loader2 className="size-4 animate-spin text-fg-soft" aria-hidden /> : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={remove}
            disabled={pending}
            aria-label={`Remove fix for ${rem.selector}`}
          >
            <Trash2 className="size-4" strokeWidth={2.5} aria-hidden />
            Remove
          </Button>
        </div>
      </div>
      {!masterEnabled || !rem.enabled ? (
        <p className="text-xs text-fg-soft">Not currently applied.</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-bold text-pink">
          {error}
        </p>
      ) : null}
    </li>
  );
}
