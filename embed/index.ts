/**
 * web-access embed — the one-line <script>.
 *
 * Design constraints (plan §3): tiny, runs in the host's main world, NEVER breaks the host page.
 * Its only job is to (1) fingerprint the page's release + template, (2) on a *new* (release,
 * template), notify the ingest API. All analysis happens server-side. Everything here is wrapped so
 * an error can never escape into host code.
 *
 * Install:
 *   <script src="https://cdn.example.com/web-access.global.js"
 *           data-site-id="YOUR_SITE" data-ingest="https://api.example.com" async></script>
 */
(() => {
  const w = window as unknown as Record<string, unknown>;

  // If we're running inside our OWN backend renderer, do nothing — otherwise the embed would
  // trigger another ingest, which renders the page again, which runs the embed again… (a loop).
  if (w.__WEB_ACCESS_RENDERER) return;

  const NS = "__webAccessEmbed";
  if (w[NS]) return; // double-injection guard
  w[NS] = { version: 1 };

  interface Config {
    siteId: string;
    ingest: string;
  }
  interface Payload {
    siteId: string;
    url: string;
    releaseId: string;
    templateFingerprint: string;
  }

  function readConfig(): Config | null {
    try {
      const el = document.currentScript as HTMLScriptElement | null;
      const ds = el?.dataset ?? {};
      const siteId = ds.siteId || (w.__WEB_ACCESS_SITE_ID as string | undefined);
      const ingestRaw = ds.ingest || (w.__WEB_ACCESS_INGEST as string | undefined);
      if (!siteId || !ingestRaw) return null;
      return { siteId: String(siteId), ingest: String(ingestRaw).replace(/\/+$/, "") };
    } catch {
      return null;
    }
  }

  const cfg = readConfig();
  if (!cfg) return; // misconfigured → do nothing, silently

  /** FNV-1a 32-bit hash → hex. Small, fast, good enough for fingerprinting. */
  function fnv1a(str: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  }

  /** Release id: explicit build id if provided, else a hash of loaded asset URLs (content-hashed). */
  function computeRelease(): string {
    const explicit =
      (w.__WEB_ACCESS_RELEASE as string | undefined) ||
      document.querySelector('meta[name="build-id"]')?.getAttribute("content");
    if (explicit) return String(explicit);
    const assets = [
      ...Array.from(document.scripts, (s) => s.src),
      ...Array.from(
        document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
        (l) => l.href,
      ),
    ]
      .filter(Boolean)
      .sort()
      .join("|");
    return fnv1a(assets || navigator.userAgent);
  }

  /** Template fingerprint: structural tag skeleton (ignores data) so we dedup per-template. */
  function computeTemplate(): string {
    const all = document.body ? document.body.getElementsByTagName("*") : [];
    const limit = Math.min(all.length, 4000);
    let skeleton = "";
    for (let i = 0; i < limit; i++) skeleton += all[i]!.tagName + ">";
    return fnv1a(skeleton);
  }

  function pageUrl(): string {
    return location.origin + location.pathname;
  }

  const seenKey = `__wa_seen_${cfg.siteId}`;

  function readSeen(): Set<string> {
    try {
      const raw = localStorage.getItem(seenKey);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  }

  function writeSeen(set: Set<string>): void {
    try {
      // keep the seen-set bounded so it can't grow forever in localStorage
      const arr = Array.from(set).slice(-200);
      localStorage.setItem(seenKey, JSON.stringify(arr));
    } catch {
      /* storage unavailable (private mode) — degrade silently */
    }
  }

  function send(payload: Payload): void {
    const body = JSON.stringify(payload);
    const endpoint = `${cfg!.ingest}/v1/ingest`;
    try {
      if (navigator.sendBeacon) {
        const ok = navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
        if (ok) return;
      }
    } catch {
      /* fall through to fetch */
    }
    try {
      void fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
        mode: "cors",
      }).catch(() => {});
    } catch {
      /* never throw into host */
    }
  }

  function maybeScan(): void {
    try {
      const releaseId = computeRelease();
      const templateFingerprint = computeTemplate();
      const stamp = `${releaseId}:${templateFingerprint}`;
      const seen = readSeen();
      if (seen.has(stamp)) return; // already reported this (release, template)
      seen.add(stamp);
      writeSeen(seen);
      send({ siteId: cfg!.siteId, url: pageUrl(), releaseId, templateFingerprint });
    } catch {
      /* never throw into host */
    }
  }

  /** Run work in idle time so we never compete with the host's rendering. */
  function idle(fn: () => void): void {
    const ric = (w.requestIdleCallback as ((cb: () => void) => void) | undefined);
    if (ric) ric(fn);
    else setTimeout(fn, 200);
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  function schedule(): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => idle(maybeScan), 800); // debounce SPA bursts, then run idle
  }

  // SPA route changes: history.pushState/replaceState don't emit events — patch them.
  try {
    const patch = (name: "pushState" | "replaceState") => {
      const orig = history[name];
      history[name] = function (this: History, ...args: unknown[]) {
        const result = (orig as (...a: unknown[]) => unknown).apply(this, args);
        schedule();
        return result;
      } as History[typeof name];
    };
    patch("pushState");
    patch("replaceState");
    window.addEventListener("popstate", schedule);
    window.addEventListener("hashchange", schedule);
  } catch {
    /* if history patching fails, the initial scan below still runs */
  }

  // Initial scan once the document is interactive.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", schedule, { once: true });
  } else {
    schedule();
  }
})();
