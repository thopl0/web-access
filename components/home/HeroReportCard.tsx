import { AlertTriangle, Check, ShoppingCart } from "lucide-react";

/**
 * A faux scan result, built from divs so the hero shows the real product shape
 * instead of a placeholder. It mocks one finding: a checkout "pay" control that
 * ships as an unlabeled icon button, with the one-line fix underneath.
 *
 * Everything here is illustrative chrome. The whole card is marked decorative
 * (aria-hidden) so a screen reader hears the headline copy, not a fake report.
 */
export function HeroReportCard() {
  return (
    <div
      aria-hidden="true"
      className="brut-card bg-surface p-5 sm:p-6 w-full max-w-md select-none"
    >
      {/* Card header: looks like a report row */}
      <div className="flex items-center justify-between border-b-[3px] border-[var(--color-line)] pb-3">
        <span className="font-display text-sm font-bold uppercase tracking-wide text-fg-soft">
          Scan result
        </span>
        <span className="inline-flex items-center gap-1.5 border-[3px] border-[var(--ink)] bg-pink px-2.5 py-1 text-xs font-bold uppercase tracking-wide font-display text-[var(--ink)]">
          <AlertTriangle className="size-3.5" strokeWidth={3} />
          1 blocker
        </span>
      </div>

      {/* The mocked page snippet under test */}
      <div className="mt-4 border-[3px] border-dashed border-[var(--color-line)] bg-bg p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-fg-soft">
          Checkout · pay button
        </p>
        <div className="mt-3 inline-flex items-center justify-center border-[3px] border-[var(--ink)] bg-green p-3 text-on-accent shadow-ink">
          <ShoppingCart className="size-5" strokeWidth={3} />
        </div>
        <p className="mt-3 text-sm text-fg-soft">
          A screen reader reads this as
          <span className="mx-1 font-bold text-fg">&ldquo;button&rdquo;</span>—
          no name, no idea what it does.
        </p>
      </div>

      {/* The fix line */}
      <div className="mt-4 flex items-start gap-3">
        <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center border-[3px] border-[var(--ink)] bg-yellow text-[var(--ink)]">
          <Check className="size-4" strokeWidth={3} />
        </span>
        <div>
          <p className="font-display text-sm font-bold text-fg">Fix</p>
          <p className="text-sm text-fg-soft">
            Add <code className="font-mono text-fg">aria-label=&quot;Pay $48&quot;</code>{" "}
            so the control announces what it does.
          </p>
        </div>
      </div>
    </div>
  );
}
