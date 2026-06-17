"use client";

import { useActionState, useId, useState, useTransition } from "react";
import { Check, Loader2, Pause, Play } from "lucide-react";

import type { ScanConfig, SiteStatus } from "@web-access/shared";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import {
  deleteSite,
  setSitePaused,
  updateScanConfig,
  updateSite,
  type DeleteSiteState,
  type ScanConfigState,
  type SiteFormState,
} from "@/app/actions/sites";

/** Small "Saved ✓" flash shown after a successful save. */
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

/** Rename / change URL. */
export function GeneralForm({
  siteId,
  name,
  origin,
}: {
  siteId: string;
  name: string;
  origin: string | null;
}) {
  const uid = useId();
  const [state, action, pending] = useActionState<SiteFormState, FormData>(updateSite, undefined);

  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="siteId" value={siteId} />
      <TextField
        id={`${uid}-name`}
        name="name"
        label="Site name"
        required
        defaultValue={name}
        error={state?.errors?.name?.[0]}
      />
      <TextField
        id={`${uid}-origin`}
        name="origin"
        label="Site URL"
        type="url"
        required
        autoComplete="url"
        defaultValue={origin ?? ""}
        hint="Used to verify the snippet and crawl pages."
        error={state?.errors?.origin?.[0]}
      />
      {state?.errors?._form?.[0] ? (
        <p role="alert" className="text-sm font-bold text-pink">
          {state.errors._form[0]}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <Button type="submit" variant="blue" size="md" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <Saved show={Boolean(state?.ok)} />
      </div>
    </form>
  );
}

/** Pages-to-scan control: mode + path globs + auto-crawl + page cap. */
export function ScanConfigForm({
  siteId,
  config,
}: {
  siteId: string;
  config: ScanConfig;
}) {
  const uid = useId();
  const [state, action, pending] = useActionState<ScanConfigState, FormData>(
    updateScanConfig,
    undefined,
  );
  const [mode, setMode] = useState(config.mode);

  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="siteId" value={siteId} />

      <div className="flex flex-col gap-2">
        <label htmlFor={`${uid}-mode`} className="font-display font-bold text-fg">
          Which pages to scan
        </label>
        <select
          id={`${uid}-mode`}
          name="mode"
          defaultValue={config.mode}
          onChange={(e) => setMode(e.target.value as ScanConfig["mode"])}
          className="min-h-[44px] w-full border-[3px] border-[var(--color-line)] bg-surface px-4 py-3 text-base text-fg"
        >
          <option value="all">All pages</option>
          <option value="allow">Only pages matching the patterns below</option>
          <option value="deny">All pages except those matching below</option>
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${uid}-patterns`} className="font-display font-bold text-fg">
          Path patterns
          {mode === "all" ? <span className="font-normal text-fg-soft"> (unused while “All pages”)</span> : null}
        </label>
        <p className="text-sm text-fg-soft">
          One per line. Use <code className="font-mono text-xs">*</code> to match within a path
          segment and <code className="font-mono text-xs">**</code> across segments — e.g.{" "}
          <code className="font-mono text-xs">/admin/**</code>, <code className="font-mono text-xs">/blog/*</code>.
        </p>
        <textarea
          id={`${uid}-patterns`}
          name="patterns"
          rows={4}
          defaultValue={config.patterns.join("\n")}
          disabled={mode === "all"}
          placeholder="/admin/**&#10;/checkout"
          className="w-full resize-y border-[3px] border-[var(--color-line)] bg-surface px-4 py-3 font-mono text-sm text-fg disabled:opacity-50"
        />
      </div>

      <label className="flex items-center gap-3 font-bold text-fg">
        <input
          type="checkbox"
          name="autoCrawl"
          defaultChecked={config.autoCrawl}
          className="size-5 accent-[var(--color-blue)]"
        />
        Auto-discover pages by crawling the site
      </label>

      <TextField
        id={`${uid}-cap`}
        name="pageCap"
        label="Max pages to monitor"
        type="number"
        defaultValue={String(config.pageCap)}
        hint="Caps how many pages a crawl will queue (1–500)."
      />

      {state?.error ? (
        <p role="alert" className="text-sm font-bold text-pink">
          {state.error}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <Button type="submit" variant="blue" size="md" disabled={pending}>
          {pending ? "Saving…" : "Save scan settings"}
        </Button>
        <Saved show={Boolean(state?.ok)} />
      </div>
    </form>
  );
}

/** Pause / resume monitoring. */
export function PauseToggle({ siteId, status }: { siteId: string; status: SiteStatus }) {
  const [cur, setCur] = useState<SiteStatus>(status);
  const [pending, start] = useTransition();
  const paused = cur === "paused";

  function toggle() {
    start(async () => {
      const res = await setSitePaused(siteId, !paused);
      if (res.ok && res.status) setCur(res.status);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="outline" size="md" onClick={toggle} disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : paused ? (
          <Play className="size-4" strokeWidth={2.5} aria-hidden />
        ) : (
          <Pause className="size-4" strokeWidth={2.5} aria-hidden />
        )}
        {paused ? "Resume monitoring" : "Pause monitoring"}
      </Button>
      <p className="text-sm text-fg-soft">
        {paused
          ? "Monitoring is paused — pings are still received but pages aren't scanned."
          : "Monitoring is active."}
      </p>
    </div>
  );
}

/** Danger zone: delete the site. Requires typing the site name to confirm. */
export function DeleteSiteForm({ siteId, name }: { siteId: string; name: string }) {
  const uid = useId();
  const [confirm, setConfirm] = useState("");
  const [state, action, pending] = useActionState<DeleteSiteState, FormData>(deleteSite, undefined);

  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="siteId" value={siteId} />
      <div className="flex flex-col gap-2">
        <label htmlFor={`${uid}-confirm`} className="font-display font-bold text-fg">
          Type “{name}” to confirm
        </label>
        <input
          id={`${uid}-confirm`}
          name="confirm"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={state?.error ? true : undefined}
          className="min-h-[44px] w-full border-[3px] border-[var(--color-line)] bg-surface px-4 py-3 text-base text-fg aria-[invalid=true]:border-pink"
        />
        {state?.error ? (
          <p role="alert" className="text-sm font-bold text-pink">
            {state.error}
          </p>
        ) : null}
      </div>
      <div>
        <button
          type="submit"
          disabled={pending || confirm !== name}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 border-[3px] border-[var(--ink)] bg-pink px-5 py-3 font-display font-bold text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Deleting…" : "Delete this site"}
        </button>
      </div>
    </form>
  );
}
