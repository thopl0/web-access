/**
 * Tiny class-name joiner. Filters falsy values so you can do:
 *   cn("base", isActive && "active", className)
 * No external deps — keeps the design system self-contained.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
