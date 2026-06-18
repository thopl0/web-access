"use client";

import { useActionState, useId, useState, useTransition } from "react";
import { Check, Download, ExternalLink, Loader2 } from "lucide-react";

import type { StatementConfig } from "@web-access/shared";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { CopyButton } from "@/components/dashboard/CopyButton";
import {
  setStatementPublished,
  updateStatementConfig,
  type StatementConfigState,
} from "@/app/actions/sites";

/** Small "Saved ✓" flash after a successful save (mirrors SiteSettingsForms). */
function Saved({ show }: { show: boolean }) {
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5 text-sm font-bold text-green">
      {show ? (
        <>
          <Check className="size-4" strokeWidth={2.75} aria-hidden /> Saved
        </>
      ) : (
        ""
      )}
    </span>
  );
}

/**
 * Manage the live accessibility statement: owner-supplied content (entity, contact, target), the
 * publish toggle for the hosted link, and the "copy onto your own site" HTML export.
 */
export function StatementSettings({
  siteId,
  origin,
  config,
  initialToken,
}: {
  siteId: string;
  origin: string;
  config: StatementConfig;
  initialToken: string | null;
}) {
  const uid = useId();
  const [state, action, pending] = useActionState<StatementConfigState, FormData>(
    updateStatementConfig,
    undefined,
  );
  const [token, setToken] = useState<string | null>(initialToken);
  const [togglePending, startToggle] = useTransition();
  const publicUrl = token ? `${origin}/statement/${token}` : null;
  const exportUrl = `/api/sites/${siteId}/statement`;

  function togglePublish() {
    startToggle(async () => {
      const res = await setStatementPublished(siteId, !token);
      if (res.ok) setToken(res.token);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-fg-soft">
        A standard accessibility statement whose conformance facts are filled in from your latest
        scan — so it never goes stale. Add the details only you can supply below.
      </p>

      <form action={action} noValidate className="flex flex-col gap-5">
        <input type="hidden" name="siteId" value={siteId} />
        <TextField
          id={`${uid}-entity`}
          name="entityName"
          label="Organisation name"
          defaultValue={config.entityName ?? ""}
          hint="Who's responsible for the site. Defaults to the site name."
        />
        <TextField
          id={`${uid}-email`}
          name="contactEmail"
          label="Accessibility contact email"
          type="email"
          autoComplete="email"
          defaultValue={config.contactEmail ?? ""}
          hint="Where visitors report accessibility problems."
        />
        <TextField
          id={`${uid}-url`}
          name="contactUrl"
          label="Contact page URL"
          type="url"
          autoComplete="url"
          defaultValue={config.contactUrl ?? ""}
          hint="Optional — a contact form or support page."
        />

        <div className="flex flex-col gap-2">
          <label htmlFor={`${uid}-target`} className="font-display font-bold text-fg">
            Target standard
          </label>
          <select
            id={`${uid}-target`}
            name="target"
            defaultValue={config.target}
            className="min-h-[44px] w-full border-[3px] border-[var(--color-line)] bg-surface px-4 py-3 text-base text-fg"
          >
            <option value="2.1-AA">WCAG 2.1 level AA (EAA / Section 508 baseline)</option>
            <option value="2.2-AA">WCAG 2.2 level AA</option>
          </select>
        </div>

        {state?.error ? (
          <p role="alert" className="text-sm font-bold text-pink">
            {state.error}
          </p>
        ) : null}
        <div className="flex items-center gap-3">
          <Button type="submit" variant="blue" size="md" disabled={pending}>
            {pending ? "Saving…" : "Save statement details"}
          </Button>
          <Saved show={Boolean(state?.ok)} />
        </div>
      </form>

      <div className="flex flex-col gap-3 border-t border-[var(--color-panel-line)] pt-5">
        <label className="flex items-center gap-3 font-bold text-fg">
          <input
            type="checkbox"
            checked={Boolean(token)}
            onChange={togglePublish}
            disabled={togglePending}
            className="size-5 accent-[var(--color-blue)]"
          />
          Publish a hosted statement link
          {togglePending ? <Loader2 className="size-4 animate-spin text-fg-soft" aria-hidden /> : null}
        </label>
        <p className="text-sm text-fg-soft">
          Anyone with the link sees a live statement — no sign-in. Turning it off revokes the link.
        </p>
        {publicUrl ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-[var(--color-panel-line-strong)] bg-[color-mix(in_srgb,var(--color-fg)_4%,transparent)] px-3 py-2 font-mono text-xs text-fg-soft">
              {publicUrl}
            </code>
            <CopyButton text={publicUrl} label="Copy link" copiedLabel="Copied" />
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[var(--color-panel-line-strong)] bg-surface px-3 py-2 text-sm font-bold text-fg no-underline transition-colors hover:bg-[color-mix(in_srgb,var(--color-fg)_5%,transparent)]"
            >
              <ExternalLink className="size-4" strokeWidth={2.5} aria-hidden />
              Preview
            </a>
          </div>
        ) : null}
      </div>

      <div className="border-t border-[var(--color-panel-line)] pt-5">
        <p className="mb-3 text-sm text-fg-soft">
          Prefer to host it yourself? Download the statement as a self-contained HTML page and paste
          it onto your own site.
        </p>
        <a
          href={exportUrl}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[var(--color-panel-line-strong)] bg-surface px-3 py-2 text-sm font-bold text-fg no-underline transition-colors hover:bg-[color-mix(in_srgb,var(--color-fg)_5%,transparent)]"
        >
          <Download className="size-4" strokeWidth={2.5} aria-hidden />
          Download statement (HTML)
        </a>
      </div>
    </div>
  );
}
