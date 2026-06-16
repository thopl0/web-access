import type { ReactNode } from "react";
import { Plus } from "lucide-react";

/**
 * One FAQ row as a native <details>/<summary> disclosure. The summary is
 * keyboard operable by default, hits the 44px target, and inherits the global
 * focus ring. The marker icon is decorative — the question text carries meaning.
 */
export function FaqItem({
  question,
  children,
}: {
  question: string;
  children: ReactNode;
}) {
  return (
    <details className="group border-[3px] border-[var(--color-line)] bg-surface shadow-brut">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-display text-lg font-bold text-fg marker:hidden">
        <span>{question}</span>
        <Plus
          className="size-6 shrink-0 transition-transform duration-200 group-open:rotate-45"
          strokeWidth={2.75}
          aria-hidden="true"
        />
      </summary>
      <div className="border-t-[3px] border-[var(--color-line)] px-5 py-4 text-fg-soft">
        {children}
      </div>
    </details>
  );
}
