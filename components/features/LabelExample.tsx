import { AlertTriangle, Check, Trash2 } from "lucide-react";

/**
 * A before/after built from divs: the same icon-only delete control as it ships
 * (no accessible name) versus the fixed version. The whole figure is decorative
 * chrome — a screen reader hears the surrounding prose, not a mock control.
 */
export function LabelExample() {
  return (
    <div
      aria-hidden="true"
      className="grid gap-4 sm:grid-cols-2 select-none"
    >
      {/* Before */}
      <div className="brut-card bg-bg p-5">
        <div className="flex items-center justify-between">
          <span className="font-display text-xs font-bold uppercase tracking-wide text-fg-soft">
            As shipped
          </span>
          <span className="inline-flex items-center gap-1.5 border-[3px] border-[var(--ink)] bg-pink px-2 py-0.5 text-xs font-bold uppercase tracking-wide font-display text-[var(--ink)]">
            <AlertTriangle className="size-3" strokeWidth={3} />
            Fails
          </span>
        </div>
        <div className="mt-4 inline-flex items-center justify-center border-[3px] border-[var(--ink)] bg-surface p-3 text-fg shadow-ink">
          <Trash2 className="size-5" strokeWidth={3} />
        </div>
        <p className="mt-3 text-sm text-fg-soft">
          Announced as just <span className="font-bold text-fg">&ldquo;button&rdquo;</span>.
          Nothing tells you it deletes the row.
        </p>
      </div>

      {/* After */}
      <div className="brut-card bg-bg p-5">
        <div className="flex items-center justify-between">
          <span className="font-display text-xs font-bold uppercase tracking-wide text-fg-soft">
            After the fix
          </span>
          <span className="inline-flex items-center gap-1.5 border-[3px] border-[var(--ink)] bg-green px-2 py-0.5 text-xs font-bold uppercase tracking-wide font-display text-on-accent">
            <Check className="size-3" strokeWidth={3} />
            Passes
          </span>
        </div>
        <div className="mt-4 inline-flex items-center justify-center border-[3px] border-[var(--ink)] bg-surface p-3 text-fg shadow-ink">
          <Trash2 className="size-5" strokeWidth={3} />
        </div>
        <p className="mt-3 text-sm text-fg-soft">
          Add{" "}
          <code className="font-mono text-fg">aria-label=&quot;Delete invoice&quot;</code>{" "}
          and it announces what it does.
        </p>
      </div>
    </div>
  );
}
