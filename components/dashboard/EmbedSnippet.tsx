"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/Button";

/**
 * Shows the one-line embed <script> for a site and a copy-to-clipboard button.
 * The snippet string is built server-side (origin resolved from the request /
 * APP_ORIGIN) and passed in, so this stays a thin client component.
 */
export function EmbedSnippet({ snippet }: { snippet: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked (insecure context / permissions) — user can select manually */
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <pre className="inset overflow-x-auto p-4 text-sm text-fg">
        <code>{snippet}</code>
      </pre>
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? (
            <Check className="size-4" strokeWidth={2.75} aria-hidden="true" />
          ) : (
            <Copy className="size-4" strokeWidth={2.75} aria-hidden="true" />
          )}
          {copied ? "Copied" : "Copy snippet"}
        </Button>
        {/* Announce the copy result to assistive tech without moving focus. */}
        <span role="status" aria-live="polite" className="sr-only">
          {copied ? "Snippet copied to clipboard" : ""}
        </span>
      </div>
    </div>
  );
}
