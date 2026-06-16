import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "yellow" | "pink" | "blue" | "green" | "outline";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 font-display font-bold " +
  "border-[3px] border-[var(--ink)] no-underline select-none brut-press shadow-ink " +
  "min-h-[44px]"; // 44px minimum touch target

const variants: Record<Variant, string> = {
  yellow: "bg-yellow text-[var(--ink)]",
  pink: "bg-pink text-[var(--ink)]",
  blue: "bg-blue text-on-accent focus-bright",
  green: "bg-green text-on-accent focus-bright",
  // Outline sits on the page, so it follows the theme line/text colors.
  outline: "bg-surface text-fg !border-[var(--color-line)] shadow-none",
};

const sizes: Record<Size, string> = {
  sm: "text-sm px-4 py-2",
  md: "text-base px-5 py-3",
  lg: "text-lg px-7 py-4",
};

type CommonProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
};

// Link form
type AsLink = CommonProps & { href: string } & Omit<
    ComponentProps<typeof Link>,
    "href" | "className"
  >;
// Button form
type AsButton = CommonProps & { href?: undefined } & Omit<
    ComponentProps<"button">,
    "className"
  >;

export function Button(props: AsLink | AsButton) {
  const { variant = "yellow", size = "md", className, children, ...rest } =
    props;
  const classes = cn(base, variants[variant], sizes[size], className);

  if (props.href !== undefined) {
    return (
      <Link className={classes} {...(rest as Omit<AsLink, keyof CommonProps>)}>
        {children}
      </Link>
    );
  }

  return (
    <button
      className={classes}
      {...(rest as Omit<AsButton, keyof CommonProps | "href">)}
    >
      {children}
    </button>
  );
}
