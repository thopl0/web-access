"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";

/** Generic copy-to-clipboard button with a transient "Copied" state, announced to assistive tech. */
export function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied",
  className,
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the text is selectable as a fallback */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[var(--color-panel-line-strong)] bg-surface px-3 py-2 text-sm font-bold text-fg transition-colors hover:bg-[color-mix(in_srgb,var(--color-fg)_5%,transparent)]",
        className,
      )}
    >
      {copied ? (
        <Check className="size-4" strokeWidth={2.75} aria-hidden />
      ) : (
        <Copy className="size-4" strokeWidth={2.5} aria-hidden />
      )}
      {copied ? copiedLabel : label}
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </button>
  );
}
