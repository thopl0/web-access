"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Check,
  ChevronDown,
  Globe,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Menu,
  Plus,
  User,
  X,
} from "lucide-react";

import { logout } from "@/app/actions/auth";
import { SITE_NAME } from "@/lib/site";
import { cn } from "@/lib/utils";

type SiteNav = { id: string; name: string; critical: number };

/** Per-site section tabs (the secondary nav, scoped to the selected property). */
function sectionsFor(id: string) {
  return [
    { href: `/dashboard/${id}`, label: "Overview", exact: true },
    { href: `/dashboard/${id}/issues`, label: "Issues" },
    { href: `/dashboard/${id}/pages`, label: "Pages" },
    { href: `/dashboard/${id}/history`, label: "History" },
    { href: `/dashboard/${id}/conformance`, label: "Conformance" },
    { href: `/dashboard/${id}/reports`, label: "Reports" },
    { href: `/dashboard/${id}/settings`, label: "Settings" },
  ];
}

/** Match the active site from the path (/dashboard/site_xxx/...). Non-site routes return null. */
function currentSiteId(pathname: string): string | null {
  const m = pathname.match(/^\/dashboard\/(site_[^/]+)/);
  return m?.[1] ?? null;
}

/** A lightweight popover menu: button + outside-click/Escape to close. */
function Menu_({
  label,
  children,
  align = "left",
  className,
  panelClassName,
}: {
  label: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
  className?: string;
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-bold text-fg transition-colors hover:bg-[color-mix(in_srgb,var(--color-fg)_6%,transparent)]"
      >
        {label}
        <ChevronDown className={cn("size-4 shrink-0 text-fg-soft transition-transform", open && "rotate-180")} aria-hidden strokeWidth={2.5} />
      </button>
      {open ? (
        <div
          role="menu"
          className={cn(
            "absolute z-50 mt-1.5 min-w-56 overflow-hidden rounded-xl border border-[var(--color-panel-line-strong)] bg-surface py-1 shadow-[var(--panel-shadow-lg)]",
            align === "right" ? "right-0" : "left-0",
            panelClassName,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

function SiteSwitcher({
  sites,
  current,
  pathname,
}: {
  sites: SiteNav[];
  current: SiteNav | null;
  pathname: string;
}) {
  // Only truly "all sites" when no site is resolved — on the issue-detail route `current` may be set
  // from `?from`, in which case the originating site (not "All sites") should read as selected.
  const onAllSites =
    !current && (pathname === "/dashboard" || pathname.startsWith("/dashboard/issues"));
  return (
    <Menu_
      label={
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="flex size-6 shrink-0 items-center justify-center rounded-md bg-blue/15 text-blue"
          >
            {current ? (
              <span className="text-xs font-bold">{current.name.charAt(0).toUpperCase()}</span>
            ) : (
              <LayoutGrid className="size-3.5" strokeWidth={2.5} />
            )}
          </span>
          <span className="truncate max-w-[40vw] sm:max-w-[16rem]">
            {current ? current.name : "All sites"}
          </span>
        </span>
      }
    >
      {(close) => (
        <>
          <Link
            href="/dashboard"
            onClick={close}
            role="menuitem"
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 text-sm font-bold no-underline transition-colors hover:bg-[color-mix(in_srgb,var(--color-fg)_5%,transparent)]",
              onAllSites ? "text-fg" : "text-fg-soft",
            )}
          >
            <LayoutGrid className="size-4 shrink-0" strokeWidth={2.25} aria-hidden />
            <span className="flex-1">All sites</span>
            {onAllSites ? <Check className="size-4 text-blue" strokeWidth={2.5} aria-hidden /> : null}
          </Link>

          {sites.length > 0 ? (
            <div className="my-1 border-t border-[var(--color-panel-line)]" />
          ) : null}

          <ul className="max-h-[50vh] overflow-y-auto">
            {sites.map((s) => {
              const active = current?.id === s.id;
              return (
                <li key={s.id}>
                  <Link
                    href={`/dashboard/${s.id}`}
                    onClick={close}
                    role="menuitem"
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-2 text-sm font-bold no-underline transition-colors hover:bg-[color-mix(in_srgb,var(--color-fg)_5%,transparent)]",
                      active ? "text-fg" : "text-fg-soft",
                    )}
                  >
                    <span
                      aria-hidden
                      className="flex size-5 shrink-0 items-center justify-center rounded bg-blue/15 text-[10px] font-bold text-blue"
                    >
                      {s.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    {s.critical > 0 ? (
                      <span
                        className="shrink-0 rounded-full bg-pink px-1.5 text-[10px] font-bold leading-4 text-[var(--ink)]"
                        aria-label={`${s.critical} critical`}
                      >
                        {s.critical}
                      </span>
                    ) : null}
                    {active ? <Check className="size-4 shrink-0 text-blue" strokeWidth={2.5} aria-hidden /> : null}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="my-1 border-t border-[var(--color-panel-line)]" />
          <Link
            href="/dashboard/sites/new"
            onClick={close}
            role="menuitem"
            className="flex items-center gap-2.5 px-3 py-2 text-sm font-bold text-link no-underline transition-colors hover:bg-[color-mix(in_srgb,var(--color-fg)_5%,transparent)]"
          >
            <Plus className="size-4 shrink-0" strokeWidth={2.5} aria-hidden />
            Add site
          </Link>
        </>
      )}
    </Menu_>
  );
}

/** The secondary nav: section tabs for the active site, or the portfolio tabs. */
function SectionTabs({
  pathname,
  current,
}: {
  pathname: string;
  current: SiteNav | null;
}) {
  const tabs = current
    ? sectionsFor(current.id)
    : [
        { href: "/dashboard", label: "Overview", exact: true },
        { href: "/dashboard/issues", label: "Issues", exact: false },
      ];

  return (
    <nav aria-label={current ? "Site sections" : "Dashboard"} className="-mb-px flex gap-1 overflow-x-auto">
      {tabs.map((t) => {
        // The global issue-detail route (/dashboard/issues/<key>) is conceptually the site's Issues
        // tab when we got here via `?from`, so light up the per-site Issues tab there too.
        const isIssuesDetail =
          t.href.endsWith("/issues") && /^\/dashboard\/issues\/.+/.test(pathname);
        const active = t.exact
          ? pathname === t.href
          : pathname === t.href || pathname.startsWith(`${t.href}/`) || isIssuesDetail;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative whitespace-nowrap px-3 py-3 text-sm font-bold no-underline transition-colors",
              active ? "text-fg" : "text-fg-soft hover:text-fg",
            )}
          >
            {t.label}
            {active ? (
              <span aria-hidden className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-blue" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="shrink-0 font-display text-lg font-bold no-underline">
      <span className="border-[3px] border-[var(--ink)] bg-yellow px-2 py-0.5 text-[var(--ink)]">
        {SITE_NAME}
      </span>
    </Link>
  );
}

export function AppShell({
  user,
  sites,
  children,
}: {
  user: { name: string | null; email: string };
  sites: SiteNav[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // The global issue-detail route (/dashboard/issues/[key]) has no site segment in its path, so the
  // nav would otherwise lose site context and fall back to "All sites". The issue links carry a
  // `?from=<siteId>`, so honor it here to keep the originating site selected and its section tabs
  // shown. Links from the global inbox omit `from`, so those correctly stay on "All sites".
  const pathSite = currentSiteId(pathname);
  const fromSite =
    !pathSite && /^\/dashboard\/issues\/.+/.test(pathname) ? searchParams.get("from") : null;
  const current = sites.find((s) => s.id === (pathSite ?? fromSite)) ?? null;
  const [drawer, setDrawer] = useState(false);
  const closeDrawer = () => setDrawer(false);

  return (
    <div className="min-h-screen bg-bg">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      {/* Top app bar */}
      <header className="sticky top-0 z-30 border-b border-[var(--color-panel-line)] bg-surface/95 backdrop-blur">
        {/* Row 1: brand · site switcher · account */}
        <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-2 px-4 sm:px-8">
          <Brand />
          <span aria-hidden className="hidden text-fg-soft/40 sm:inline">/</span>

          {/* Desktop switcher */}
          <div className="hidden sm:block">
            <SiteSwitcher sites={sites} current={current} pathname={pathname} />
          </div>

          <div className="ml-auto flex items-center gap-1">
            <Link
              href="/dashboard/sites/new"
              className="hidden items-center gap-1.5 rounded-lg border border-[var(--color-panel-line-strong)] bg-surface px-3 py-1.5 text-sm font-bold text-fg no-underline transition-colors hover:bg-[color-mix(in_srgb,var(--color-fg)_5%,transparent)] sm:inline-flex"
            >
              <Plus className="size-4" strokeWidth={2.5} aria-hidden />
              Add site
            </Link>

            {/* Desktop account menu */}
            <div className="hidden sm:block">
              <Menu_
                align="right"
                label={
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="flex size-7 items-center justify-center rounded-full bg-blue text-sm font-bold text-on-accent"
                    >
                      {(user.name ?? user.email).charAt(0).toUpperCase()}
                    </span>
                  </span>
                }
                panelClassName="min-w-60"
              >
                {(close) => (
                  <>
                    <div className="px-3 py-2">
                      <p className="truncate text-sm font-bold text-fg">{user.name ?? "Your account"}</p>
                      <p className="truncate text-xs text-fg-soft">{user.email}</p>
                    </div>
                    <div className="my-1 border-t border-[var(--color-panel-line)]" />
                    <Link href="/dashboard/account" onClick={close} role="menuitem" className="flex items-center gap-2.5 px-3 py-2 text-sm font-bold text-fg-soft no-underline transition-colors hover:bg-[color-mix(in_srgb,var(--color-fg)_5%,transparent)] hover:text-fg">
                      <User className="size-4" strokeWidth={2.25} aria-hidden />
                      Account
                    </Link>
                    <Link href="/" onClick={close} role="menuitem" className="flex items-center gap-2.5 px-3 py-2 text-sm font-bold text-fg-soft no-underline transition-colors hover:bg-[color-mix(in_srgb,var(--color-fg)_5%,transparent)] hover:text-fg">
                      <Globe className="size-4" strokeWidth={2.25} aria-hidden />
                      Public site
                    </Link>
                    <form action={logout}>
                      <button type="submit" className="flex w-full items-center gap-2.5 px-3 py-2 text-sm font-bold text-fg-soft transition-colors hover:bg-[color-mix(in_srgb,var(--color-fg)_5%,transparent)] hover:text-fg">
                        <LogOut className="size-4" strokeWidth={2.25} aria-hidden />
                        Log out
                      </button>
                    </form>
                  </>
                )}
              </Menu_>
            </div>

            {/* Mobile menu button */}
            <button
              type="button"
              onClick={() => setDrawer(true)}
              className="inline-flex size-10 items-center justify-center rounded-lg border border-[var(--color-panel-line-strong)] text-fg sm:hidden"
              aria-label="Open menu"
              aria-expanded={drawer}
            >
              <Menu className="size-5" aria-hidden />
            </button>
          </div>
        </div>

        {/* Row 2: section tabs */}
        <div className="border-t border-[var(--color-panel-line)]">
          <div className="mx-auto max-w-[1180px] px-4 sm:px-8">
            <SectionTabs pathname={pathname} current={current} />
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      {drawer ? (
        <div className="sm:hidden">
          <div className="fixed inset-0 z-40 bg-black/40" aria-hidden onClick={closeDrawer} />
          <div className="fixed inset-y-0 right-0 z-50 w-80 max-w-[88vw] overflow-y-auto border-l border-[var(--color-panel-line)] bg-surface p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <Brand />
              <button type="button" onClick={closeDrawer} className="inline-flex size-9 items-center justify-center rounded-lg text-fg-soft hover:text-fg" aria-label="Close menu">
                <X className="size-5" aria-hidden />
              </button>
            </div>

            <p className="mt-5 px-1 text-xs font-bold uppercase tracking-[0.12em] text-fg-soft">Sites</p>
            <ul className="mt-2 flex flex-col gap-0.5">
              <li>
                <Link href="/dashboard" onClick={closeDrawer} className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-bold no-underline", !current ? "bg-[color-mix(in_srgb,var(--color-fg)_8%,transparent)] text-fg" : "text-fg-soft")}>
                  <LayoutDashboard className="size-4" strokeWidth={2.25} aria-hidden /> All sites
                </Link>
              </li>
              {sites.map((s) => (
                <li key={s.id}>
                  <Link href={`/dashboard/${s.id}`} onClick={closeDrawer} className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-bold no-underline", current?.id === s.id ? "bg-[color-mix(in_srgb,var(--color-fg)_8%,transparent)] text-fg" : "text-fg-soft")}>
                    <span aria-hidden className="flex size-5 items-center justify-center rounded bg-blue/15 text-[10px] font-bold text-blue">{s.name.charAt(0).toUpperCase()}</span>
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    {s.critical > 0 ? <span className="rounded-full bg-pink px-1.5 text-[10px] font-bold leading-4 text-[var(--ink)]">{s.critical}</span> : null}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/dashboard/sites/new" onClick={closeDrawer} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-bold text-link no-underline">
                  <Plus className="size-4" strokeWidth={2.5} aria-hidden /> Add site
                </Link>
              </li>
            </ul>

            {current ? (
              <>
                <p className="mt-5 px-1 text-xs font-bold uppercase tracking-[0.12em] text-fg-soft">{current.name}</p>
                <ul className="mt-2 flex flex-col gap-0.5">
                  {sectionsFor(current.id).map((t) => {
                    const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
                    return (
                      <li key={t.href}>
                        <Link href={t.href} onClick={closeDrawer} className={cn("block rounded-lg px-3 py-2 text-sm font-bold no-underline", active ? "bg-[color-mix(in_srgb,var(--color-fg)_8%,transparent)] text-fg" : "text-fg-soft")}>
                          {t.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <ul className="mt-2 flex flex-col gap-0.5">
                <li>
                  <Link href="/dashboard/issues" onClick={closeDrawer} className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-bold no-underline", pathname.startsWith("/dashboard/issues") ? "bg-[color-mix(in_srgb,var(--color-fg)_8%,transparent)] text-fg" : "text-fg-soft")}>
                    <Inbox className="size-4" strokeWidth={2.25} aria-hidden /> Issues
                  </Link>
                </li>
              </ul>
            )}

            <div className="mt-5 border-t border-[var(--color-panel-line)] pt-3">
              <div className="flex items-center gap-2.5 px-1 py-1.5">
                <span aria-hidden className="flex size-8 items-center justify-center rounded-full bg-blue text-sm font-bold text-on-accent">{(user.name ?? user.email).charAt(0).toUpperCase()}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-fg">{user.name ?? "Your account"}</p>
                  <p className="truncate text-xs text-fg-soft">{user.email}</p>
                </div>
              </div>
              <Link href="/dashboard/account" onClick={closeDrawer} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-bold text-fg-soft no-underline hover:text-fg">
                <User className="size-4" strokeWidth={2.25} aria-hidden /> Account
              </Link>
              <form action={logout}>
                <button type="submit" className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-bold text-fg-soft hover:text-fg">
                  <LogOut className="size-4" strokeWidth={2.25} aria-hidden /> Log out
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {/* Content */}
      <main id="main-content" className="min-w-0">
        {children}
      </main>
    </div>
  );
}
