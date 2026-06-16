import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";

type Tone = "yellow" | "pink" | "blue" | "green";

/**
 * One numbered step in the walkthrough. A big chunky number block, a Lucide
 * icon, the heading, the explanation, and a slot for the micro-example.
 */
export function StepCard({
  number,
  icon: Icon,
  tone,
  titleId,
  title,
  children,
}: {
  number: number;
  icon: LucideIcon;
  tone: Tone;
  titleId: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <Card tone="surface" className="relative">
      <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
        {/* Number + icon rail */}
        <div className="flex shrink-0 flex-row items-center gap-4 sm:flex-col sm:items-start">
          <span
            className={`flex h-16 w-16 items-center justify-center border-[3px] border-[var(--ink)] font-display text-3xl font-bold shadow-ink ${
              tone === "blue" || tone === "green"
                ? "bg-blue text-on-accent"
                : tone === "pink"
                  ? "bg-pink text-[var(--ink)]"
                  : "bg-yellow text-[var(--ink)]"
            }`}
            aria-hidden="true"
          >
            {number}
          </span>
          <span
            className="flex h-12 w-12 items-center justify-center border-[3px] border-[var(--color-line)] bg-surface text-fg"
            aria-hidden="true"
          >
            <Icon className="h-6 w-6" aria-hidden="true" />
          </span>
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="text-2xl sm:text-3xl text-fg">
            {title}
          </h3>
          <div className="mt-4 space-y-4 text-base sm:text-lg text-fg-soft">
            {children}
          </div>
        </div>
      </div>
    </Card>
  );
}
