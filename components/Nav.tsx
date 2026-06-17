"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { CTA, NAV_LINKS, SITE_NAME } from "@/lib/site";
import { Button } from "@/components/ui/Button";
import { logout } from "@/app/actions/auth";
import { cn } from "@/lib/utils";

/**
 * Site header. Session state is resolved server-side in NavServer and passed in
 * as `authed`: logged-out visitors see the Log in / Sign up CTAs; logged-in
 * users see Dashboard + Log out. The Log out control is a Server-Action form so
 * it works without JS.
 */
export function Nav({ authed = false }: { authed?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Closing on link click keeps the menu from lingering across navigations
  // without a setState-in-effect (which React now flags).
  const close = () => setOpen(false);

  return (
    <header className="sticky top-0 z-50 border-b-[3px] border-[var(--color-line)] bg-bg">
      <nav
        aria-label="Primary"
        className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-8"
      >
        <Link
          href="/"
          className="font-display text-2xl font-bold text-fg no-underline"
        >
          <span className="bg-yellow text-[var(--ink)] border-[3px] border-[var(--ink)] px-2 py-0.5">
            {SITE_NAME}
          </span>
        </Link>

        {/* Desktop links */}
        <ul className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-[44px] items-center px-4 font-display font-bold no-underline border-[3px]",
                    // Text color is mutually exclusive: never let the flipping
                    // `text-fg` coexist with the fixed `text-[var(--ink)]` (the
                    // flipping one wins the cascade and breaks dark mode on yellow).
                    active
                      ? "border-[var(--color-line)] bg-yellow text-[var(--ink)]"
                      : "border-transparent text-fg hover:border-[var(--color-line)]",
                  )}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Desktop CTAs */}
        <div className="hidden items-center gap-3 lg:flex">
          {authed ? (
            <>
              <Button href="/dashboard" variant="outline" size="sm">
                Dashboard
              </Button>
              <form action={logout}>
                <Button type="submit" variant="blue" size="sm">
                  Log out
                </Button>
              </form>
            </>
          ) : (
            <>
              <Button href={CTA.secondary.href} variant="outline" size="sm">
                {CTA.secondary.label}
              </Button>
              <Button href={CTA.primary.href} variant="blue" size="sm">
                {CTA.primary.label}
              </Button>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          className="lg:hidden inline-flex min-h-[44px] min-w-[44px] items-center justify-center border-[3px] border-[var(--color-line)] bg-surface text-fg brut-press shadow-ink"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          {open ? (
            <X aria-hidden="true" size={24} />
          ) : (
            <Menu aria-hidden="true" size={24} />
          )}
        </button>
      </nav>

      {/* Mobile menu — always in the DOM so the toggle's aria-controls points
          at a real element; `hidden` when closed removes it from the layout and
          the accessibility tree (and takes its links out of the tab order). */}
      <div
        id="mobile-menu"
        hidden={!open}
        className="lg:hidden border-t-[3px] border-[var(--color-line)] bg-bg"
      >
        <ul className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-5 py-4 sm:px-8">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={close}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "block min-h-[44px] border-[3px] border-[var(--color-line)] px-4 py-2 font-display font-bold no-underline",
                    // Mutually exclusive text color (see desktop note above).
                    active ? "bg-yellow text-[var(--ink)]" : "bg-surface text-fg",
                  )}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
          <li className="mt-2 flex flex-col gap-3">
            {authed ? (
              <>
                <Button href="/dashboard" variant="outline" onClick={close}>
                  Dashboard
                </Button>
                <form action={logout} onSubmit={close}>
                  <Button type="submit" variant="blue" className="w-full">
                    Log out
                  </Button>
                </form>
              </>
            ) : (
              <>
                <Button href={CTA.secondary.href} variant="outline" onClick={close}>
                  {CTA.secondary.label}
                </Button>
                <Button href={CTA.primary.href} variant="blue" onClick={close}>
                  {CTA.primary.label}
                </Button>
              </>
            )}
          </li>
        </ul>
      </div>
    </header>
  );
}
