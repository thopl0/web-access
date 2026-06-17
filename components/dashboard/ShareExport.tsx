"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { CopyButton } from "@/components/dashboard/CopyButton";
import { setSiteSharing } from "@/app/actions/sites";

/**
 * Toggle a site's public read-only report link. The token lives server-side; we rebuild the URL
 * client-side from `origin` so it updates instantly when toggled.
 */
export function ShareToggle({
  siteId,
  origin,
  initialToken,
}: {
  siteId: string;
  origin: string;
  initialToken: string | null;
}) {
  const [token, setToken] = useState<string | null>(initialToken);
  const [pending, start] = useTransition();
  const url = token ? `${origin}/share/${token}` : null;

  function toggle() {
    start(async () => {
      const res = await setSiteSharing(siteId, !token);
      if (res.ok) setToken(res.token);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-3 font-bold text-fg">
        <input
          type="checkbox"
          checked={Boolean(token)}
          onChange={toggle}
          disabled={pending}
          className="size-5 accent-[var(--color-blue)]"
        />
        Public report link
        {pending ? <Loader2 className="size-4 animate-spin text-fg-soft" aria-hidden /> : null}
      </label>
      <p className="text-sm text-fg-soft">
        Anyone with the link can view a read-only accessibility report — no sign-in. Turning it off
        revokes the link.
      </p>
      {url ? (
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg border border-[var(--color-panel-line-strong)] bg-[color-mix(in_srgb,var(--color-fg)_4%,transparent)] px-3 py-2 font-mono text-xs text-fg-soft">
            {url}
          </code>
          <CopyButton text={url} label="Copy link" copiedLabel="Copied" />
        </div>
      ) : null}
    </div>
  );
}
