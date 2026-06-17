"use client";

import { useState, useTransition } from "react";
import { Ban, Check, Loader2, RotateCcw } from "lucide-react";

import type { IssueStatus } from "@web-access/shared";
import { setIssueStatus } from "@/app/actions/issues";
import { cn } from "@/lib/utils";

const BTN =
  "inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors disabled:opacity-60";

/** Lifecycle controls for one issue: resolve / ignore when open, reopen when muted. */
export function IssueActions({
  issueKey,
  status,
  size = "md",
}: {
  issueKey: string;
  status: IssueStatus;
  size?: "sm" | "md";
}) {
  const [cur, setCur] = useState<IssueStatus>(status);
  const [pending, start] = useTransition();

  function set(next: IssueStatus) {
    start(async () => {
      const res = await setIssueStatus(issueKey, next);
      if (res.ok && res.status) setCur(res.status as IssueStatus);
    });
  }

  const spinner = pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null;
  const muted = cur === "resolved" || cur === "ignored" || cur === "snoozed";

  return (
    <div className={cn("flex flex-wrap items-center gap-2", size === "sm" && "text-xs")}>
      {!muted ? (
        <>
          <button
            type="button"
            onClick={() => set("resolved")}
            disabled={pending}
            className={cn(BTN, "border-green/50 text-green hover:bg-green/10")}
          >
            {spinner ?? <Check className="size-4" strokeWidth={2.75} aria-hidden />}
            Mark resolved
          </button>
          <button
            type="button"
            onClick={() => set("ignored")}
            disabled={pending}
            className={cn(BTN, "border-[var(--color-panel-line-strong)] text-fg-soft hover:text-fg")}
          >
            {spinner ?? <Ban className="size-4" strokeWidth={2.5} aria-hidden />}
            Ignore
          </button>
        </>
      ) : (
        <>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold",
              cur === "resolved" ? "text-green" : "text-fg-soft",
            )}
          >
            {cur === "resolved" ? (
              <Check className="size-4" strokeWidth={2.75} aria-hidden />
            ) : (
              <Ban className="size-4" strokeWidth={2.5} aria-hidden />
            )}
            {cur === "resolved" ? "Resolved" : cur === "snoozed" ? "Snoozed" : "Ignored"}
          </span>
          <button
            type="button"
            onClick={() => set("open")}
            disabled={pending}
            className={cn(BTN, "border-[var(--color-panel-line-strong)] text-fg-soft hover:text-fg")}
          >
            {spinner ?? <RotateCcw className="size-4" strokeWidth={2.5} aria-hidden />}
            Reopen
          </button>
        </>
      )}
    </div>
  );
}
