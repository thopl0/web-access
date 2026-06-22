"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Repeat, X } from "lucide-react";

import { setRuleAutofix } from "@/app/actions/remediation";

type Row = { ruleId: string; title: string };

/** Settings list of the issue types this site auto-fixes going forward, each with a "stop" control. */
export function AutoFixList({ siteId, rules }: { siteId: string; rules: Row[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  function stop(ruleId: string) {
    setBusy(ruleId);
    start(async () => {
      await setRuleAutofix(siteId, ruleId, false);
      setBusy(null);
      router.refresh();
    });
  }

  if (rules.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-fg-soft">
        <Repeat className="size-4 shrink-0" aria-hidden strokeWidth={2.5} />
        No issue types are auto-fixed yet. Turn one on from an issue&apos;s detail page to stop it
        recurring in your inbox.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {rules.map((r) => (
        <li
          key={r.ruleId}
          className="flex items-center gap-3 rounded-lg border border-[var(--color-panel-line)] bg-surface px-3 py-2.5"
        >
          <Repeat className="size-4 shrink-0 text-green" aria-hidden strokeWidth={2.5} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-bold text-fg">{r.title}</span>
            <code className="block truncate text-xs text-fg-soft">{r.ruleId}</code>
          </span>
          <button
            type="button"
            onClick={() => stop(r.ruleId)}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-panel-line-strong)] px-2.5 py-1.5 text-sm font-bold text-fg-soft transition-colors hover:text-fg disabled:opacity-60"
          >
            {busy === r.ruleId ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <X className="size-4" aria-hidden strokeWidth={2.5} />}
            Stop
          </button>
        </li>
      ))}
    </ul>
  );
}
