/**
 * Build the one-line embed <script> for a site. Pure + client-safe (no server imports) so it can
 * be used in Server Components, Server Actions, and Client Components alike. `origin` is OUR app's
 * public origin (where the embed script and ingest API live), resolved server-side via
 * `lib/server/origin.ts`.
 */
export function embedSnippet(origin: string, siteId: string): string {
  const clean = origin.replace(/\/+$/, "");
  return `<script src="${clean}/embed/web-access.global.js" data-site-id="${siteId}" data-ingest="${clean}" async></script>`;
}
