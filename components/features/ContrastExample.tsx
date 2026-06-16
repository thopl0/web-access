import { Check, X } from "lucide-react";

/**
 * Two contrast samples built from divs: text laid over a photo-ish ground, once
 * where it's readable and once where it isn't, each with the measured ratio and
 * a pass/fail chip. Illustrative only, so the whole figure is decorative.
 */
export function ContrastExample() {
  return (
    <div aria-hidden="true" className="grid gap-4 sm:grid-cols-2 select-none">
      {/* Fail sample: pale text on a light band */}
      <div className="brut-card overflow-hidden bg-surface">
        <div
          className="relative flex h-28 items-center justify-center p-4"
          style={{
            backgroundImage:
              "linear-gradient(120deg, var(--color-yellow), #f3e9c2 60%, #ffffff)",
          }}
        >
          <span className="font-display text-lg font-bold text-white/80">
            Free shipping today
          </span>
        </div>
        <div className="flex items-center justify-between border-t-[3px] border-[var(--color-line)] p-3">
          <span className="font-mono text-sm text-fg">1.6:1</span>
          <span className="inline-flex items-center gap-1.5 border-[3px] border-[var(--ink)] bg-pink px-2 py-0.5 text-xs font-bold uppercase tracking-wide font-display text-[var(--ink)]">
            <X className="size-3" strokeWidth={3} />
            Fails
          </span>
        </div>
      </div>

      {/* Pass sample: dark text on the same band */}
      <div className="brut-card overflow-hidden bg-surface">
        <div
          className="relative flex h-28 items-center justify-center p-4"
          style={{
            backgroundImage:
              "linear-gradient(120deg, var(--color-yellow), #f3e9c2 60%, #ffffff)",
          }}
        >
          <span className="font-display text-lg font-bold text-[var(--ink)]">
            Free shipping today
          </span>
        </div>
        <div className="flex items-center justify-between border-t-[3px] border-[var(--color-line)] p-3">
          <span className="font-mono text-sm text-fg">9.2:1</span>
          <span className="inline-flex items-center gap-1.5 border-[3px] border-[var(--ink)] bg-green px-2 py-0.5 text-xs font-bold uppercase tracking-wide font-display text-on-accent">
            <Check className="size-3" strokeWidth={3} />
            Passes
          </span>
        </div>
      </div>
    </div>
  );
}
