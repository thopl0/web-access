"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, Bell, CheckCircle2, Loader2, ScanLine } from "lucide-react";

import { openNotifications } from "@/app/actions/notifications";
import type { NotificationItem } from "@/lib/server/notifications";
import { cn } from "@/lib/utils";

/** Short "2h ago" / "3d ago" label; falls back to a date past a week. */
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function NotificationRow({ n, onNavigate }: { n: NotificationItem; onNavigate: () => void }) {
  return (
    <Link
      href={`/dashboard/${n.siteId}`}
      onClick={onNavigate}
      role="menuitem"
      className={cn(
        "flex gap-3 px-3 py-2.5 no-underline transition-colors hover:bg-[color-mix(in_srgb,var(--color-fg)_5%,transparent)]",
        n.unread ? "bg-blue/5" : "",
      )}
    >
      <span aria-hidden className="mt-0.5 shrink-0">
        {n.introduced > 0 ? (
          <AlertTriangle className="size-4 text-[color-mix(in_srgb,var(--color-fg)_70%,var(--yellow))]" strokeWidth={2.25} />
        ) : n.resolved > 0 ? (
          <CheckCircle2 className="size-4 text-green" strokeWidth={2.25} />
        ) : (
          <ScanLine className="size-4 text-fg-soft" strokeWidth={2.25} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-bold text-fg">{n.siteName}</span>
          <span className="shrink-0 text-xs text-fg-soft">{timeAgo(n.at)}</span>
        </span>
        <span className="mt-0.5 block text-xs text-fg-soft">
          Re-scanned · {n.pages} {n.pages === 1 ? "page" : "pages"}
          {n.introduced > 0 ? (
            <span className="font-bold text-[color-mix(in_srgb,var(--color-fg)_70%,var(--yellow))]">
              {" · "}
              {n.introduced} new {n.introduced === 1 ? "issue" : "issues"}
            </span>
          ) : null}
          {n.resolved > 0 ? (
            <span className="font-bold text-green">
              {" · "}
              {n.resolved} fixed
            </span>
          ) : null}
        </span>
      </span>
      {n.unread ? <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-blue" /> : null}
    </Link>
  );
}

/**
 * Top-bar notifications bell. The unread badge comes from the server (cheap count); opening the dropdown
 * lazily loads the full feed AND marks everything read (advances the per-user "seen" marker), so the
 * badge clears. Self-contained popover: closes on outside-click / Escape.
 */
export function NotificationsBell({ initialUnread }: { initialUnread: number }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  // Badge = the server count, unless the owner has opened the bell (which marks everything read). Reset
  // the "acknowledged" flag whenever a fresh count arrives from the server on navigation — the
  // derive-state-from-props pattern, so no effect is needed to keep the badge correct.
  const [acknowledged, setAcknowledged] = useState(false);
  const [lastCount, setLastCount] = useState(initialUnread);
  if (initialUnread !== lastCount) {
    setLastCount(initialUnread);
    setAcknowledged(false);
  }
  const unread = acknowledged ? 0 : initialUnread;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setAcknowledged(true); // opening marks everything read server-side
      startTransition(async () => {
        const res = await openNotifications();
        setItems(res.items);
      });
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative inline-flex size-9 items-center justify-center rounded-lg border border-[var(--color-panel-line-strong)] text-fg-soft transition-colors hover:bg-[color-mix(in_srgb,var(--color-fg)_5%,transparent)] hover:text-fg"
      >
        <Bell className="size-[18px]" strokeWidth={2.25} aria-hidden />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-pink px-1 text-[10px] font-bold leading-none text-on-accent">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Notifications"
          className="absolute right-0 z-40 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-xl border border-[var(--color-panel-line)] bg-surface shadow-[var(--panel-shadow)]"
        >
          <div className="border-b border-[var(--color-panel-line)] px-3 py-2.5">
            <p className="text-sm font-bold text-fg">Notifications</p>
          </div>
          <div className="max-h-96 divide-y divide-[var(--color-panel-line)] overflow-y-auto">
            {pending && !items ? (
              <div className="flex items-center gap-2 px-3 py-6 text-sm text-fg-soft">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
              </div>
            ) : items && items.length > 0 ? (
              items.map((n) => <NotificationRow key={n.id} n={n} onNavigate={() => setOpen(false)} />)
            ) : (
              <p className="px-3 py-8 text-center text-sm text-fg-soft">
                No recent activity. New scans and issues will show up here.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
