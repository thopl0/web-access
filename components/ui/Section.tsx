import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Centered max-width container with responsive gutters. */
export function Container({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-5 sm:px-8", className)}>
      {children}
    </div>
  );
}

/**
 * Semantic section wrapper with consistent vertical rhythm. Pass `bleading`
 * (an aria-labelledby target id) when the section has a heading, so landmarks
 * stay named. `as` defaults to <section>.
 */
export function Section({
  children,
  className,
  innerClassName,
  as,
  ariaLabelledby,
  ariaLabel,
  id,
  decoration,
}: {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  as?: ElementType;
  ariaLabelledby?: string;
  ariaLabel?: string;
  id?: string;
  /** Decorative background layer (e.g. parallax world-shapes) painted behind
   *  the content, full-section-bleed. Always rendered aria-hidden + clipped. */
  decoration?: ReactNode;
}) {
  const Tag = as ?? "section";
  const hasDecoration = Boolean(decoration);
  return (
    <Tag
      id={id}
      aria-labelledby={ariaLabelledby}
      aria-label={ariaLabel}
      className={cn(
        "py-16 sm:py-24",
        hasDecoration && "relative overflow-hidden",
        className,
      )}
    >
      {hasDecoration ? (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          {decoration}
        </div>
      ) : null}
      <Container className={cn(hasDecoration && "relative", innerClassName)}>
        {children}
      </Container>
    </Tag>
  );
}

/**
 * Standard section heading block: a colored eyebrow badge + big display title
 * + optional lead paragraph. Returns the heading with the given id so the
 * parent <section> can reference it via aria-labelledby.
 */
export function SectionHeading({
  id,
  eyebrow,
  title,
  lead,
  level = 2,
  className,
}: {
  id: string;
  eyebrow?: string;
  title: ReactNode;
  lead?: ReactNode;
  level?: 2 | 3;
  className?: string;
}) {
  const Heading = (level === 2 ? "h2" : "h3") as ElementType;
  return (
    <div className={cn("max-w-3xl", className)}>
      {eyebrow ? (
        <p className="mb-4 inline-block border-[3px] border-[var(--ink)] bg-yellow px-3 py-1 text-sm font-bold uppercase tracking-wide text-[var(--ink)] font-display">
          {eyebrow}
        </p>
      ) : null}
      <Heading
        id={id}
        className="text-4xl sm:text-5xl lg:text-6xl text-fg"
      >
        {title}
      </Heading>
      {lead ? (
        <p className="mt-5 text-lg sm:text-xl text-fg-soft max-w-2xl">{lead}</p>
      ) : null}
    </div>
  );
}
