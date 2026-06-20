import { Worker } from "bullmq";
import { chromium, type Browser, type Page } from "playwright";
import { eq } from "drizzle-orm";
import {
  CRAWL_QUEUE,
  MONITOR_QUEUE,
  RENDER_QUEUE,
  isSafeRemediationAttr,
  pathAllowed,
  type CrawlJob,
  type Finding,
  type MonitorJob,
  type RenderJob,
} from "@web-access/shared";
import {
  runAnalysis,
  enrichFindings,
  suggestFixes,
  generateReportSummary,
  type FindingExplanation,
} from "@web-access/analyzers";
import { db, schema } from "../lib/server/db";
import { env } from "../lib/server/env";
import { storage, shotKey, evidenceKey } from "../lib/server/storage";
import { getConnection, getMonitorQueue } from "../lib/server/queue";
import { enqueueCrawl, enqueueScan } from "../lib/server/scan";
import { notifyCriticalScan, notifyNewIssues, sendWeeklyDigests } from "../lib/server/notify";
import { getScanDelta } from "../lib/server/verification";
import { ownerEntitlements, getUserPlans, entitlementsFor } from "../lib/server/entitlements";

const connection = getConnection();

/** Pull the alt VALUE back out of a vision `aiFix.after` snippet (`<img alt="…" src="…">`) so it can
 *  be stored as a runtime-applicable {attr:"alt"} patch. Returns "" if no alt is parseable — the
 *  caller then drops the attributePatch (the before→after markup still carries the fix). */
function aiFixAlt(after: string): string {
  const m = after.match(/\balt=("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/);
  if (!m) return "";
  try {
    // The snippet builds alt with JSON.stringify, so it's a JSON string literal — parse it back.
    const parsed: unknown = JSON.parse(m[1]!.replace(/^'|'$/g, '"'));
    return typeof parsed === "string" ? parsed : "";
  } catch {
    return "";
  }
}

// Cropped visual evidence: screenshot just the offending element so the dashboard can SHOW it.
const MAX_EVIDENCE = 40; // cap per scan — worst issues first
const MAX_EVIDENCE_PX = 1_500_000; // ~1500×1000; skip near-full-page elements (keep crops "cropped")
// Concrete before→after fixes: cap per scan (mirrors enrichment's cap) so a giant scan can't blow the
// AI budget/latency. Worst-first, so the highest-impact findings are the ones that get a paste-ready fix.
const MAX_FIXES = 25;
const SEVERITY_RANK: Record<string, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };

type EvidenceCrop = {
  findingId: number;
  // Raw PNG bytes — uploaded to object storage, then dropped in favour of an `objectKey` DB row.
  buf: Buffer;
  width: number;
  height: number;
  // Document-relative top-left (CSS px), so the dashboard can place this element on the full-page
  // screenshot. Null when we couldn't resolve a layout box for it.
  pageX: number | null;
  pageY: number | null;
};

// Full-page screenshot per scan, bounded so a giant page can't bloat the DB or the dashboard.
// Captured as JPEG: a rendered page compresses to a fraction of the PNG size, so even long landing
// pages (routinely 8–12k px tall) fit comfortably. Only truly endless/infinite-scroll pages skip.
const MAX_SHOT_HEIGHT = 20000; // px — skip endlessly-tall pages (infinite scroll, etc.)
const MAX_SHOT_BYTES = 3_000_000; // drop the canvas (not the crops) if it's still heavier than this
const SHOT_QUALITY = 80; // JPEG quality — legible for text while keeping size small

type ScanShot = { buf: Buffer; width: number; height: number };

/** One full-page screenshot for the scan — the canvas element highlights overlay onto. Captured as
 *  JPEG; bytes go to object storage. Best-effort: returns null for over-tall/over-heavy pages so the
 *  detail view degrades to per-element crops. */
async function captureScanShot(page: Page): Promise<ScanShot | null> {
  try {
    const dims = await page.evaluate(() => {
      const d = document.documentElement;
      return { width: d.scrollWidth, height: d.scrollHeight };
    });
    if (!dims.width || !dims.height || dims.height > MAX_SHOT_HEIGHT) return null;
    const buf = await page.screenshot({ fullPage: true, type: "jpeg", quality: SHOT_QUALITY, timeout: 8000 });
    if (buf.byteLength > MAX_SHOT_BYTES) return null;
    return { buf, width: Math.round(dims.width), height: Math.round(dims.height) };
  } catch {
    return null;
  }
}

/** Screenshot each finding's element (worst-first, capped). Best-effort: skip anything we can't grab.
 *  Also records the element's document-relative position so the dashboard can highlight it on the
 *  full-page shot. */
async function captureEvidence(
  page: Page,
  findings: Finding[],
  ids: { id: number }[],
): Promise<EvidenceCrop[]> {
  const order = findings
    .map((_, i) => i)
    .sort((a, b) => {
      const ra = SEVERITY_RANK[findings[a]!.impact ?? "minor"] ?? 9;
      const rb = SEVERITY_RANK[findings[b]!.impact ?? "minor"] ?? 9;
      return ra - rb;
    })
    .slice(0, MAX_EVIDENCE);

  const rows: EvidenceCrop[] = [];
  for (const i of order) {
    const id = ids[i]?.id;
    const selector = findings[i]?.selector;
    if (id == null || !selector) continue;
    try {
      const loc = page.locator(selector).first();
      // Document-relative box (includes scroll), so it lines up with the fullPage screenshot.
      const box = await loc.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height };
      });
      if (!box || box.w < 1 || box.h < 1) continue;
      if (box.w * box.h > MAX_EVIDENCE_PX) continue; // too big to be a useful crop
      const buf = await loc.screenshot({ timeout: 2500 });
      rows.push({
        findingId: id,
        buf,
        width: Math.round(box.w),
        height: Math.round(box.h),
        pageX: Math.round(box.x),
        pageY: Math.round(box.y),
      });
    } catch {
      // element missing/detached/offscreen/un-screenshotable — evidence is optional, move on
    }
  }
  return rows;
}

// One shared browser process; a fresh context per job for isolation.
let browser: Browser | null = null;
async function getBrowser(): Promise<Browser> {
  if (!browser) browser = await chromium.launch();
  return browser;
}

const worker = new Worker<RenderJob>(
  RENDER_QUEUE,
  async (job) => {
    const { scanId, siteId, url, renderedHtml } = job.data;
    await db.update(schema.scans).set({ status: "running" }).where(eq(schema.scans.id, scanId));

    const context = await (await getBrowser()).newContext();
    // Mark this as our renderer so the embed (if present on the page) no-ops and can't self-trigger.
    await context.addInitScript(() => {
      (window as unknown as Record<string, unknown>).__WEB_ACCESS_RENDERER = true;
    });
    const page = await context.newPage();
    try {
      if (renderedHtml) {
        await page.setContent(renderedHtml, { waitUntil: "domcontentloaded" });
      } else {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: env.NAV_TIMEOUT_MS });
      }

      // The owner's plan gates the AI tiers (judge / enrichment / AI fixes); the deterministic
      // tiers + fixes always run. Unowned sites are anonymous homepage trials → "Free" tier
      // (aiJudge:false), so they stay deterministic-only and never spend metered Gemma / GLM.
      const ent = await ownerEntitlements(siteId);

      const findings = await runAnalysis(page, { ai: ent.aiJudge });

      // Insert findings first so we can key cropped evidence to their ids. Postgres returns the
      // rows in insertion order, so `ids[i]` lines up with `findings[i]`.
      //
      // `aiFix` is a TRANSIENT field (a ready-made, pixel-grounded fix the vision judge handed us);
      // the `findings` table has no such column, so strip it before the insert and keep an
      // index-aligned record so the "Concrete fixes" block can store it directly below.
      const aiFixByIdx = findings.map((f) => f.aiFix ?? null);
      let ids: { id: number }[] = [];
      if (findings.length > 0) {
        ids = await db
          .insert(schema.findings)
          .values(
            findings.map((f) => {
              const row = { ...f };
              delete row.aiFix; // transient — kept in aiFixByIdx, not a findings column
              return { scanId, ...row };
            }),
          )
          .returning({ id: schema.findings.id });
      }

      // Upload each crop's bytes to object storage, then persist only the storage key. A failed
      // upload drops that crop (evidence is optional) rather than failing the scan.
      const crops = await captureEvidence(page, findings, ids);
      const evidenceRows: (typeof schema.evidence.$inferInsert)[] = [];
      for (const c of crops) {
        const key = evidenceKey(c.findingId);
        try {
          await storage.put(key, c.buf, "image/png");
          evidenceRows.push({
            findingId: c.findingId,
            objectKey: key,
            width: c.width,
            height: c.height,
            pageX: c.pageX,
            pageY: c.pageY,
          });
        } catch (err) {
          console.error(`scan ${scanId} evidence upload failed (finding ${c.findingId}):`, err);
        }
      }
      if (evidenceRows.length > 0) {
        await db.insert(schema.evidence).values(evidenceRows).onConflictDoNothing();
      }

      // One full-page screenshot for the scan — the canvas the dashboard overlays element
      // highlights onto. Only worth keeping if we actually have boxes to highlight.
      if (evidenceRows.some((r) => r.pageX != null)) {
        const shot = await captureScanShot(page);
        if (shot) {
          const key = shotKey(scanId);
          try {
            await storage.put(key, shot.buf, "image/jpeg");
            await db
              .insert(schema.scanShots)
              .values({ scanId, objectKey: key, width: shot.width, height: shot.height })
              .onConflictDoNothing();
          } catch (err) {
            console.error(`scan ${scanId} full-page shot upload failed:`, err);
          }
        }
      }

      // Tier-3 AI: rewrite the deterministic findings' generic messages into element-specific,
      // plain-language guidance (text-only; no-ops when GLM is unconfigured). Best-effort — a
      // failure here must not fail the scan, so explanations stay optional.
      let explained = 0;
      try {
        const explanations = ent.aiJudge ? await enrichFindings(findings) : [];
        const rows = explanations
          .map((e, i) => (e && ids[i] ? { findingId: ids[i]!.id, ...e } : null))
          .filter((r): r is { findingId: number } & FindingExplanation => r !== null);
        if (rows.length > 0) {
          await db.insert(schema.findingExplanations).values(rows).onConflictDoNothing();
          explained = rows.length;
        }
      } catch (err) {
        console.error(`scan ${scanId} enrichment failed:`, err);
      }

      // Concrete fixes: turn each finding into paste-ready before→after markup (the product's core
      // differentiator). Deterministic transforms run for free; judgment rules (alt-text content,
      // ambiguous link text) fall back to the text-only AI in ONE batched call (no-op when GLM is
      // unconfigured — Phase A still works via deterministic fixes). Worst-first + capped like
      // enrichment, and best-effort: a failure here must not fail the scan, so fixes stay optional.
      let fixed = 0;
      try {
        type FixRow = typeof schema.fixSuggestions.$inferInsert;
        const rows: FixRow[] = [];

        // (1) Vision ride-along fixes: a finding that carries a transient `aiFix` already has a
        // pixel-grounded fix in hand (the Gemma judge wrote the alt while it had the image). Store it
        // DIRECTLY — no model call, and exclude it from the GLM batch below so it can't be overwritten
        // by a worse, text-derived guess. These are high-value, so they bypass the worst-first cap.
        const handled = new Set<number>(); // finding indices already fixed here
        findings.forEach((f, i) => {
          const aiFix = aiFixByIdx[i];
          if (!aiFix || !ids[i]) return;
          handled.add(i);
          // attributePatch (the runtime-applicable form) only when it's safe AND clearly a plain alt
          // SET: that's the alt-text-inaccurate case (the image already exposes alt; we just replace
          // its value). For decorative-misclassified the correct fix also involves removing the
          // decorative declaration (role/aria-hidden), so a single alt patch isn't the whole story —
          // omit it there and let the before→after markup carry the fix.
          const attrPatch =
            f.ruleId === "alt-text-inaccurate" && isSafeRemediationAttr("alt")
              ? [{ attr: "alt" as const, value: aiFixAlt(aiFix.after) }]
              : null;
          rows.push({
            findingId: ids[i]!.id,
            kind: "ai",
            before: f.htmlSnippet,
            after: aiFix.after,
            needsReview: true,
            note: aiFix.note ?? "AI-generated from the image — verify it's accurate before publishing.",
            attributePatch: attrPatch && attrPatch[0]!.value ? attrPatch : null,
          });
        });

        // (2) Everything else: compute over the worst findings first, capped, EXCLUDING the findings
        // already handled above. `fixIdx[]` maps each computed result back to its row id.
        const fixIdx = findings
          .map((_, i) => i)
          .filter((i) => !handled.has(i))
          .sort((a, b) => {
            const ra = SEVERITY_RANK[findings[a]!.impact ?? "minor"] ?? 9;
            const rb = SEVERITY_RANK[findings[b]!.impact ?? "minor"] ?? 9;
            return ra - rb;
          })
          .slice(0, MAX_FIXES);
        const suggestions = await suggestFixes(fixIdx.map((i) => findings[i]!), { ai: ent.aiJudge });
        suggestions.forEach((s, j) => {
          const i = fixIdx[j]!;
          if (!s || !ids[i]) return;
          rows.push({
            findingId: ids[i]!.id,
            kind: s.kind,
            before: s.before,
            after: s.after,
            needsReview: s.needsReview,
            note: s.note ?? null,
            attributePatch: s.attributePatch ?? null,
          });
        });

        if (rows.length > 0) {
          await db.insert(schema.fixSuggestions).values(rows).onConflictDoNothing();
          fixed = rows.length;
        }
      } catch (err) {
        console.error(`scan ${scanId} fix suggestion failed:`, err);
      }

      // Intelligent report: the plain-English executive summary + the legal-risk "start here" triage
      // list, stored per-scan (its own table, like explanations/fixes). `generateReportSummary` always
      // returns a complete deterministic result and only calls GLM when the AI tier is on, so it never
      // throws — but the surrounding try/catch + best-effort upsert keep a DB or model hiccup from ever
      // failing the scan, exactly like enrichment/fixes above. Needs the site's display name for the
      // summary prose — one light lookup (unowned system sites still have a name).
      let summarized = 0;
      try {
        const siteRow = (
          await db
            .select({ name: schema.sites.name })
            .from(schema.sites)
            .where(eq(schema.sites.id, siteId))
            .limit(1)
        )[0];
        const summary = await generateReportSummary(findings, {
          siteName: siteRow?.name ?? "your site",
          ai: ent.aiJudge,
        });
        await db
          .insert(schema.scanSummaries)
          .values({
            scanId,
            plainSummary: summary.plainSummary,
            triage: summary.triage,
            source: summary.source,
          })
          .onConflictDoUpdate({
            target: schema.scanSummaries.scanId,
            set: {
              plainSummary: summary.plainSummary,
              triage: summary.triage,
              source: summary.source,
            },
          });
        summarized = 1;
      } catch (err) {
        console.error(`scan ${scanId} report summary failed:`, err);
      }

      await db
        .update(schema.scans)
        .set({ status: "complete", completedAt: new Date() })
        .where(eq(schema.scans.id, scanId));

      // Alert the owner when a scan surfaces critical issues — deduped to once/day/site via a
      // Redis cooldown key so re-scans don't spam. Monitoring alerts are a Pro feature, so free
      // owners' (and unowned trial) scans complete silently — no email.
      const criticalCount = findings.filter((f) => f.impact === "critical").length;
      if (ent.monitoring && criticalCount > 0) {
        const acquired = await connection.set(
          `notify:critical:${siteId}`,
          "1",
          "EX",
          86400,
          "NX",
        );
        if (acquired) void notifyCriticalScan(siteId, criticalCount).catch(() => {});
      }

      // Regression alert: if this update introduced issues that weren't in the previous scan, tell the
      // owner what changed. Deduped per site via a 1-hour cooldown so a multi-page crawl (many scan
      // jobs) sends at most one — and we only compute the DB-heavy delta when not already on cooldown.
      // Like the critical alert, this is monitoring output → Pro-only, so skip the whole check (and its
      // delta query) for free/unowned owners.
      if (ent.monitoring) {
        try {
          const onCooldown = await connection.get(`notify:regression:${siteId}`);
          if (!onCooldown) {
            const delta = await getScanDelta(siteId);
            if (delta.hasPrevious && delta.introduced.length > 0) {
              const acquired = await connection.set(`notify:regression:${siteId}`, "1", "EX", 3600, "NX");
              if (acquired) void notifyNewIssues(siteId, delta).catch(() => {});
            }
          }
        } catch (err) {
          console.error(`scan ${scanId} regression check failed:`, err);
        }
      }

      return { findings: findings.length, evidence: evidenceRows.length, explained, fixed, summarized };
    } finally {
      await context.close();
    }
  },
  { connection, concurrency: env.CONCURRENCY },
);

// ---------------------------------------------------------------------------
// Crawl worker: render a site's origin, discover same-origin pages, fan out into render scans.
// Triggered on first verification (and on demand). Light work — one page render for link
// discovery; the heavy per-page analysis happens in the render worker above.
// ---------------------------------------------------------------------------

/** FNV-1a 32-bit hash → hex. Mirrors the embed's hashing so crawl scans share a fingerprint shape. */
function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Normalize a discovered href to a same-origin `origin+pathname` (matching the embed's pageUrl),
 *  or null if it's off-origin / not http(s). Query + hash are dropped so instances collapse. */
function normalizeUrl(raw: string, base: string): string | null {
  try {
    const u = new URL(raw, base);
    if (!/^https?:$/.test(u.protocol)) return null;
    if (u.origin !== new URL(base).origin) return null;
    return u.origin + u.pathname;
  } catch {
    return null;
  }
}

const crawlWorker = new Worker<CrawlJob>(
  CRAWL_QUEUE,
  async (job) => {
    const { siteId, origin } = job.data;

    const rows = await db
      .select({ status: schema.sites.status, scanConfig: schema.sites.scanConfig })
      .from(schema.sites)
      .where(eq(schema.sites.id, siteId))
      .limit(1);
    const siteRow = rows[0];
    if (!siteRow || siteRow.status === "paused") return { skipped: true };
    const config = siteRow.scanConfig;

    const context = await (await getBrowser()).newContext();
    await context.addInitScript(() => {
      (window as unknown as Record<string, unknown>).__WEB_ACCESS_RENDERER = true;
    });
    const page = await context.newPage();

    let discovered: string[] = [];
    try {
      await page.goto(origin, { waitUntil: "domcontentloaded", timeout: env.NAV_TIMEOUT_MS });
      const hrefs = await page.$$eval("a[href]", (els) =>
        els.map((e) => (e as HTMLAnchorElement).href),
      );
      const set = new Set<string>();
      const root = normalizeUrl(origin, origin);
      if (root) set.add(root); // always include the landing page itself
      for (const h of hrefs) {
        const n = normalizeUrl(h, origin);
        if (n) set.add(n);
      }
      // Apply the site's page-access control, then cap how many pages we monitor.
      discovered = [...set].filter((u) => pathAllowed(u, config)).slice(0, config.pageCap);
    } finally {
      await context.close();
    }

    // releaseId keyed by the crawl run so a scheduled re-crawl re-scans, but one run dedups per-url.
    const runId = job.id ?? "crawl";
    let enqueued = 0;
    for (const url of discovered) {
      const res = await enqueueScan({
        siteId,
        url,
        releaseId: `crawl:${runId}`,
        templateFingerprint: fnv1a(url),
      });
      if (!res.deduped) enqueued += 1;
    }
    return { discovered: discovered.length, enqueued };
  },
  { connection, concurrency: 1 },
);

crawlWorker.on("completed", (job, result) =>
  console.log(`crawl ${job.data.siteId} complete:`, result),
);
crawlWorker.on("failed", (job, err) =>
  console.error(`crawl ${job?.data.siteId} failed:`, err?.message),
);

// ---------------------------------------------------------------------------
// Monitor worker: a periodic tick that re-crawls every verified, non-paused, auto-crawl site so
// monitoring is continuous (catches regressions between releases), not only release-triggered.
// The recurring schedule is registered below via a BullMQ job scheduler.
// ---------------------------------------------------------------------------
const monitorWorker = new Worker<MonitorJob>(
  MONITOR_QUEUE,
  async (job) => {
    // The monitor queue carries two recurring jobs, distinguished by name.
    if (job.name === "digest") {
      const sent = await sendWeeklyDigests();
      return { digest: sent };
    }

    const rows = await db
      .select({
        id: schema.sites.id,
        origin: schema.sites.origin,
        ownerId: schema.sites.ownerId,
        scanConfig: schema.sites.scanConfig,
      })
      .from(schema.sites)
      .where(eq(schema.sites.status, "verified"));

    // Continuous monitoring is a Pro feature. Resolve every distinct owner's plan in ONE query (vs.
    // ownerEntitlements per row), then skip any site whose owner lacks the monitoring entitlement —
    // free owners (and unowned sites) are silently dropped here. Their first scan + manual rescans
    // still run; only the automatic re-crawl is withheld.
    const plans = await getUserPlans(
      rows.map((r) => r.ownerId).filter((v): v is string => v !== null),
    );

    let queued = 0;
    let skipped = 0;
    for (const s of rows) {
      if (!s.origin || !s.scanConfig.autoCrawl) continue;
      const plan = s.ownerId ? plans.get(s.ownerId) : undefined;
      if (!entitlementsFor(plan).monitoring) {
        skipped += 1;
        continue;
      }
      await enqueueCrawl(s.id, s.origin, "scheduled");
      queued += 1;
    }
    return { eligible: rows.length, queued, skipped };
  },
  { connection, concurrency: 1 },
);

monitorWorker.on("completed", (_job, result) => console.log("monitor tick:", result));
monitorWorker.on("failed", (_job, err) => console.error("monitor tick failed:", err?.message));

// Register (idempotently) the recurring monitor tick. MONITOR_INTERVAL_MS=0 disables it.
if (env.MONITOR_INTERVAL_MS > 0) {
  void getMonitorQueue()
    .upsertJobScheduler(
      "site-monitor",
      { every: env.MONITOR_INTERVAL_MS },
      { name: "tick", opts: { removeOnComplete: 50, removeOnFail: 50 } },
    )
    .then(() => console.log(`monitor scheduled every ${env.MONITOR_INTERVAL_MS}ms`))
    .catch((err) => console.error("failed to schedule monitor:", err));
}

// Recurring weekly digest email. DIGEST_INTERVAL_MS=0 disables it (and it no-ops without email).
if (env.DIGEST_INTERVAL_MS > 0) {
  void getMonitorQueue()
    .upsertJobScheduler(
      "weekly-digest",
      { every: env.DIGEST_INTERVAL_MS },
      { name: "digest", opts: { removeOnComplete: 20, removeOnFail: 20 } },
    )
    .then(() => console.log(`digest scheduled every ${env.DIGEST_INTERVAL_MS}ms`))
    .catch((err) => console.error("failed to schedule digest:", err));
}

worker.on("ready", () => console.log("worker ready — waiting for render jobs"));
worker.on("completed", (job, result) =>
  console.log(`scan ${job.data.scanId} complete:`, result),
);
worker.on("failed", async (job, err) => {
  console.error(`scan ${job?.data.scanId} failed:`, err?.message);
  if (job) {
    await db
      .update(schema.scans)
      .set({ status: "error", error: String(err?.message ?? err), completedAt: new Date() })
      .where(eq(schema.scans.id, job.data.scanId))
      .catch(() => {});
  }
});

async function shutdown(): Promise<void> {
  await Promise.all([worker.close(), crawlWorker.close(), monitorWorker.close()]);
  if (browser) await browser.close();
  connection.disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
