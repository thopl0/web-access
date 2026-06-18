import { AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { CopyButton } from "@/components/dashboard/CopyButton";
import { explainRule } from "@/lib/explain";
import type { IssueElement } from "@/lib/server/report";

/** Plain-language headline for a rule (falls back to the raw dev message). */
export function ruleTitle(ruleId: string, message: string): string {
  return explainRule(ruleId)?.title ?? message;
}

/** "What this means / How to fix it" + technical meta (rule id, WCAG, help link).
 *  Shown once per issue — in the page view inside each group, in the issue view
 *  once at the top of the rule card. */
export function IssueExplain({
  ruleId,
  message,
  wcag,
  helpUrl,
}: {
  ruleId: string;
  message: string;
  wcag: string[];
  helpUrl?: string;
}) {
  const ex = explainRule(ruleId);
  return (
    <>
      {ex ? (
        <>
          <p className="text-xs font-bold uppercase tracking-wide text-fg-soft">
            What this means
          </p>
          <p className="mt-1 text-fg">{ex.what}</p>
          <p className="mt-3 text-xs font-bold uppercase tracking-wide text-fg-soft">
            How to fix it
          </p>
          <p className="mt-1 text-fg">{ex.fix}</p>
        </>
      ) : (
        <p className="text-fg">{message}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <code className="text-xs text-fg-soft">{ruleId}</code>
        {wcag.map((w) => (
          <Badge key={w} tone="surface">
            WCAG {w}
          </Badge>
        ))}
        {helpUrl ? (
          <a
            href={helpUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-auto text-link underline underline-offset-2 font-bold"
          >
            Learn more →
          </a>
        ) : null}
      </div>
      {ex ? <p className="mt-2 text-sm text-fg-soft">{message}</p> : null}
    </>
  );
}

/** For a collapsed (multi-page) entry: which concrete pages an element appears on. */
function ElementPages({ urls, total }: { urls: string[]; total: number }) {
  const SHOWN = 5;
  const all = urls.length >= total;
  const pathOf = (u: string) => {
    try {
      return new URL(u).pathname || "/";
    } catch {
      return u;
    }
  };
  return (
    <p className="mt-2 text-xs text-fg-soft">
      {all ? (
        <>Affects all {total} pages</>
      ) : (
        <>
          Affects {urls.length} of {total} pages:{" "}
          <span className="break-all">{urls.slice(0, SHOWN).map(pathOf).join(", ")}</span>
          {urls.length > SHOWN ? ` +${urls.length - SHOWN} more` : ""}
        </>
      )}
    </p>
  );
}

/** The list of offending elements for one issue: screenshot + selector + snippet. */
export function IssueElements({
  elements,
  grouped = false,
  pageCount = 1,
  keyPrefix,
}: {
  elements: IssueElement[];
  grouped?: boolean;
  pageCount?: number;
  keyPrefix: string;
}) {
  return (
    <ul className="flex flex-col gap-3">
      {elements.map((el, i) => (
        <li key={`${keyPrefix}-${i}`} className="rounded-lg border border-[var(--inset-line)] bg-surface p-3">
          {el.screenshot ? (
            // eslint-disable-next-line @next/next/no-img-element -- access-controlled image route, not optimizable
            <img
              src={el.screenshot}
              alt={`Screenshot of the affected element: ${el.selector}`}
              width={el.width}
              height={el.height}
              className="mb-3 max-h-64 w-auto max-w-full rounded-md border border-[var(--inset-line)] bg-white"
            />
          ) : (
            <p className="mb-2 text-sm text-fg-soft">No preview captured for this one.</p>
          )}
          {el.explanation ? (
            <div className="mb-3">
              {el.explanation.title ? (
                <p className="font-bold text-fg">{el.explanation.title}</p>
              ) : null}
              <p className="mt-1 text-sm text-fg">{el.explanation.what}</p>
              <p className="mt-1 text-sm text-fg">
                <span className="font-bold">Fix: </span>
                {el.explanation.fix}
              </p>
            </div>
          ) : null}
          {el.fix ? (
            <div className="mb-3 rounded-lg border border-[var(--inset-line)] p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <p className="text-xs font-bold uppercase tracking-wide text-blue">Suggested fix</p>
                {el.fix.kind === "ai" || el.fix.needsReview ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-pink/15 px-2 py-0.5 text-xs font-bold text-pink">
                    <AlertTriangle className="size-3 shrink-0" aria-hidden strokeWidth={2.5} />
                    Needs review
                  </span>
                ) : null}
              </div>
              <p className="text-xs font-bold uppercase tracking-wide text-fg-soft">Current</p>
              <pre className="inset mt-1 overflow-x-auto p-2 text-sm text-fg">
                <code>{el.fix.before}</code>
              </pre>
              <p className="mt-2 text-xs font-bold uppercase tracking-wide text-fg-soft">Should be</p>
              <pre className="inset mt-1 overflow-x-auto p-2 text-sm text-fg">
                <code>{el.fix.after}</code>
              </pre>
              {(el.fix.kind === "ai" || el.fix.needsReview) && el.fix.note ? (
                <p className="mt-2 text-xs text-fg-soft">{el.fix.note}</p>
              ) : null}
              <div className="mt-3">
                <CopyButton
                  text={el.fix.after}
                  label="Copy fixed code"
                  copiedLabel="Code copied"
                  className="text-xs"
                />
              </div>
            </div>
          ) : null}
          <p className="text-xs font-bold uppercase tracking-wide text-fg-soft">Code location</p>
          <code className="mt-1 block break-all text-sm text-fg">{el.selector}</code>
          <pre className="inset mt-2 overflow-x-auto p-2 text-sm text-fg">
            <code>{el.htmlSnippet}</code>
          </pre>
          {grouped && el.urls ? <ElementPages urls={el.urls} total={pageCount} /> : null}
        </li>
      ))}
    </ul>
  );
}
