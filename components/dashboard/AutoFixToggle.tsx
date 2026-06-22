"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Repeat } from "lucide-react";

import { setRuleAutofix } from "@/app/actions/remediation";

/**
 * Per-rule "auto-fix this kind of issue going forward" switch, shown on the issue detail for issues
 * whose fixes are safe attributes. Turning it on applies the rule's current spots immediately and
 * auto-applies future occurrences (worker), so this issue type stops reappearing in the open inbox.
 */
export function AutoFixToggle({
  siteId,
  ruleId,
  initialEnabled,
}: {
  siteId: string;
  ruleId: string;
  initialEnabled: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    setError(null);
    start(async () => {
      const res = await setRuleAutofix(siteId, ruleId, next);
      if (!res.ok) {
        setEnabled(!next);
        setError(res.error ?? "Couldn't update auto-fix.");
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="mt-3 rounded-lg border border-[var(--color-panel-line)] bg-surface p-3">
      <label className="flex cursor-pointer items-start gap-2.5 font-bold text-fg">
        <input
          type="checkbox"
          checked={enabled}
          onChange={toggle}
          disabled={pending}
          className="mt-0.5 size-5 shrink-0 accent-[var(--color-blue)]"
        />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <Repeat className="size-4 shrink-0 text-fg-soft" aria-hidden strokeWidth={2.5} />
            Auto-fix issues like this in the future
            {pending ? <Loader2 className="size-4 animate-spin text-fg-soft" aria-hidden /> : null}
          </span>
          <span className="mt-1 block text-xs font-normal text-fg-soft">
            Applies this safe fix to every current and future occurrence automatically, so this issue
            type stops coming back. Safe attributes only — you can turn it off any time in Settings.
          </span>
        </span>
      </label>
      {error ? (
        <p role="alert" className="mt-2 text-sm font-bold text-pink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
