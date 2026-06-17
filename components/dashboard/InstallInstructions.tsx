"use client";

import { useId, useState } from "react";

import { EmbedSnippet } from "@/components/dashboard/EmbedSnippet";

/**
 * Platform-specific install guidance for the one-line snippet. The snippet is identical everywhere
 * (a single <script> in the <head>); only WHERE you paste it differs by builder — so each tab is a
 * short set of steps wrapped around the same copy-able code. Targets the non-technical "built my
 * site with an AI tool" audience this product is for.
 */
type Platform = {
  id: string;
  label: string;
  steps: string[];
};

const PLATFORMS: Platform[] = [
  {
    id: "html",
    label: "HTML",
    steps: [
      "Open your site's main HTML file (or template).",
      "Paste the snippet just before the closing </head> tag.",
      "Save and publish your site.",
    ],
  },
  {
    id: "wordpress",
    label: "WordPress",
    steps: [
      "Install a header-scripts plugin (e.g. WPCode) — or use your theme's “Header & Footer” settings.",
      "Paste the snippet into the Header (<head>) section.",
      "Save changes.",
    ],
  },
  {
    id: "wix",
    label: "Wix",
    steps: [
      "Go to your Wix Dashboard → Settings → Custom Code.",
      "Click “+ Add Custom Code”, paste the snippet, and choose to load it on All pages in the Head.",
      "Click Apply.",
    ],
  },
  {
    id: "webflow",
    label: "Webflow",
    steps: [
      "Open Project Settings → Custom Code.",
      "Paste the snippet into the “Head Code” box and Save.",
      "Publish your site.",
    ],
  },
  {
    id: "ai",
    label: "AI builder",
    steps: [
      "Tell your AI builder: “Add this script tag to the site's <head> on every page.”",
      "Paste the snippet so it can place it — or drop it into the exported index.html's <head>.",
      "Deploy / publish the updated site.",
    ],
  },
  {
    id: "gtm",
    label: "Google Tag Manager",
    steps: [
      "In GTM, create a new Tag → Custom HTML.",
      "Paste the snippet, then set the trigger to All Pages.",
      "Save, then Submit & Publish your container.",
    ],
  },
];

export function InstallInstructions({ snippet }: { snippet: string }) {
  const [active, setActive] = useState(PLATFORMS[0].id);
  const baseId = useId();
  const current = PLATFORMS.find((p) => p.id === active) ?? PLATFORMS[0];

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Install instructions by platform" className="flex flex-wrap gap-2">
        {PLATFORMS.map((p) => {
          const selected = p.id === active;
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              id={`${baseId}-tab-${p.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${p.id}`}
              onClick={() => setActive(p.id)}
              className={
                "rounded-full border px-3 py-1.5 text-sm font-bold transition-colors " +
                (selected
                  ? "border-[var(--ink)] bg-blue text-on-accent"
                  : "border-[var(--color-panel-line-strong)] text-fg-soft hover:text-fg")
              }
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${baseId}-panel-${current.id}`}
        aria-labelledby={`${baseId}-tab-${current.id}`}
        className="flex flex-col gap-4"
      >
        <ol className="flex flex-col gap-2 text-sm text-fg-soft">
          {current.steps.map((step, i) => (
            <li key={i} className="flex gap-2.5">
              <span
                aria-hidden
                className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-fg)_8%,transparent)] text-xs font-bold text-fg"
              >
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <EmbedSnippet snippet={snippet} />
      </div>
    </div>
  );
}
