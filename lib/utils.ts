/**
 * Tiny class-name joiner. Filters falsy values so you can do:
 *   cn("base", isActive && "active", className)
 * No external deps — keeps the design system self-contained.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * Build a data URL for a base64 image, detecting PNG vs JPEG from its signature so both historical
 * PNG screenshots and newer JPEG ones render. JPEG base64 begins "/9j/"; everything else is PNG.
 */
export function imageDataUrl(base64: string): string {
  const mime = base64.startsWith("/9j/") ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${base64}`;
}
