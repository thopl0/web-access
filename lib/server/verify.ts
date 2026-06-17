import "server-only";

/**
 * Active install check: server-fetch the site's own origin and confirm the web-access embed
 * <script> for THIS site is present in the returned HTML. This is the "Check now" half of the
 * hybrid verification flow (the other half is passive — the ingest API flips a site to verified
 * on its first ping). It only sees the snippet if it's in the initial HTML, which it is: the embed
 * is a literal <script> tag, not injected later. SPA/auth-gated pages that can't be fetched cold
 * fall back to passive verification.
 */

export type InstallCheck =
  | { ok: true }
  | {
      ok: false;
      reason: "no_origin" | "unreachable" | "http_error" | "snippet_missing" | "wrong_site";
      detail?: string;
    };

const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 2_000_000; // don't slurp unbounded pages

/** Fetch `origin` and look for `web-access.global.js` carrying this site's id. */
export async function checkSnippetInstalled(
  origin: string | null,
  siteId: string,
): Promise<InstallCheck> {
  if (!origin) return { ok: false, reason: "no_origin" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(origin, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        // Identify ourselves; some origins block unknown agents.
        "user-agent": "web-access-verifier/1.0 (+https://access.ekcat.com)",
        accept: "text/html,application/xhtml+xml",
      },
    });
  } catch (err) {
    return { ok: false, reason: "unreachable", detail: String((err as Error)?.message ?? err) };
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) return { ok: false, reason: "http_error", detail: `HTTP ${res.status}` };

  const html = (await res.text()).slice(0, MAX_HTML_BYTES);
  if (!/web-access\.global\.js/i.test(html)) return { ok: false, reason: "snippet_missing" };
  // The snippet is present — make sure it carries THIS site's id (not another site's, or the demo).
  if (!html.includes(siteId)) return { ok: false, reason: "wrong_site" };
  return { ok: true };
}

/** Plain-language message for an install-check failure, safe to show the owner. */
export function installCheckMessage(check: Extract<InstallCheck, { ok: false }>): string {
  switch (check.reason) {
    case "no_origin":
      return "Add your site's URL first, then we can check it for you.";
    case "unreachable":
      return "We couldn't reach your site. Check the URL is public and live, then try again.";
    case "http_error":
      return `Your site responded with an error (${check.detail ?? "non-200"}). Try again once it's reachable.`;
    case "snippet_missing":
      return "We reached your site but didn't find the snippet. Make sure it's pasted into the page's <head> and published.";
    case "wrong_site":
      return "We found a web-access snippet, but with a different site ID. Use the exact snippet shown for this site.";
  }
}
