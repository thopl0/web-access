"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/** Sub-navigation across a single site's sections (report / pages / settings). */
export function SiteTabs({ siteId }: { siteId: string }) {
  const pathname = usePathname();
  const tabs = [
    { href: `/dashboard/${siteId}`, label: "Report" },
    { href: `/dashboard/${siteId}/pages`, label: "Pages" },
    { href: `/dashboard/${siteId}/history`, label: "History" },
    { href: `/dashboard/${siteId}/conformance`, label: "Conformance" },
    { href: `/dashboard/${siteId}/settings`, label: "Settings" },
  ];

  return (
    <nav
      aria-label="Site sections"
      className="flex gap-1 border-b border-[var(--color-panel-line)]"
    >
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative px-3 py-2 text-sm font-bold no-underline transition-colors",
              active ? "text-fg" : "text-fg-soft hover:text-fg",
            )}
          >
            {t.label}
            {active ? (
              <span aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-blue" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
