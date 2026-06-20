/**
 * The set of site-building platforms a site owner can tell us they use, and the one thing that
 * actually changes the remediation output: whether the platform is an AI builder (you fix a site by
 * pasting a PROMPT back into it) or a CMS/site builder (you fix a site by following click-path STEPS).
 *
 * Pure + client-safe (no server-only imports), like `lib/effort.ts` / `lib/explain.ts` — this is the
 * single source of truth for the platform set, shared by the UI (a picker), the API (validating the
 * owner's choice), and the generator (`builderPrompt.ts`, which branches on `isAiBuilder`).
 */

/** Every platform we recognise. `"other"` is the catch-all for anything unlisted (hand-coded sites,
 *  unknown builders) — treated as a CMS-style "instructions" platform, not a prompt target. */
export const PLATFORMS = [
  "lovable",
  "v0",
  "bolt",
  "replit",
  "cursor",
  "wix",
  "wordpress",
  "webflow",
  "squarespace",
  "framer",
  "other",
] as const;

export type Platform = (typeof PLATFORMS)[number];

/** Human display labels (proper casing/branding) for each platform. */
export const PLATFORM_LABELS: Record<Platform, string> = {
  lovable: "Lovable",
  v0: "v0",
  bolt: "Bolt",
  replit: "Replit",
  cursor: "Cursor",
  wix: "Wix",
  wordpress: "WordPress",
  webflow: "Webflow",
  squarespace: "Squarespace",
  framer: "Framer",
  other: "Other",
};

/**
 * AI builders the owner fixes by pasting a PROMPT back into (Lovable, v0, Bolt, Replit, Cursor,
 * Framer's AI). For these, the generator emits one copy-paste prompt. Everything else
 * (Wix/WordPress/Webflow/Squarespace and the `"other"` catch-all) is a CMS/site builder where the
 * owner clicks through an editor, so the generator emits numbered, platform-specific steps instead.
 */
const AI_BUILDERS: ReadonlySet<Platform> = new Set<Platform>([
  "lovable",
  "v0",
  "bolt",
  "replit",
  "cursor",
  "framer",
]);

/** True for paste-a-prompt AI builders; false for the click-through-steps CMS/site builders. */
export function isAiBuilder(p: Platform): boolean {
  return AI_BUILDERS.has(p);
}

/** Narrow an arbitrary string to a known `Platform` (e.g. validating an API/query value). */
export function isPlatform(s: string): s is Platform {
  return (PLATFORMS as readonly string[]).includes(s);
}
