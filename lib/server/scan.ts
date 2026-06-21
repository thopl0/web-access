// NOTE: deliberately NOT `import "server-only"` — this module is shared with the BullMQ worker,
// which runs under plain tsx (no react-server condition), where server-only throws at import.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import type { CrawlJob } from "@web-access/shared";
import { db, schema } from "./db";
import { getCrawlQueue, getRenderQueue } from "./queue";

/**
 * Dedup-insert a scan row and enqueue its render job. The single place a scan is created, shared by
 * the ingest API (embed-triggered) and the crawler (discovery-triggered) so dedup behaves
 * identically everywhere. Dedup key is (siteId, releaseId, templateFingerprint) — re-posting the
 * same release+template is a no-op that returns the existing scan.
 */
export async function enqueueScan(input: {
  siteId: string;
  url: string;
  releaseId: string;
  templateFingerprint: string;
  renderedHtml?: string;
}): Promise<{ scanId: string | null; deduped: boolean }> {
  const { siteId, url, releaseId, templateFingerprint, renderedHtml } = input;
  const scanId = randomUUID();

  const inserted = await db
    .insert(schema.scans)
    .values({ id: scanId, siteId, url, releaseId, templateFingerprint, status: "queued" })
    .onConflictDoNothing({
      target: [schema.scans.siteId, schema.scans.releaseId, schema.scans.templateFingerprint],
    })
    .returning({ id: schema.scans.id });

  if (inserted.length === 0) {
    const existing = await db
      .select({ id: schema.scans.id })
      .from(schema.scans)
      .where(
        and(
          eq(schema.scans.siteId, siteId),
          eq(schema.scans.releaseId, releaseId),
          eq(schema.scans.templateFingerprint, templateFingerprint),
        ),
      )
      .limit(1);
    return { scanId: existing[0]?.id ?? null, deduped: true };
  }

  await getRenderQueue().add(
    "scan",
    { scanId, siteId, url, ...(renderedHtml ? { renderedHtml } : {}) },
    {
      removeOnComplete: 500,
      removeOnFail: 500,
      // Retry transient nav failures (a 429/503 from an over-pressed host) with a real wait between
      // tries, not BullMQ's 5ms default — a page that only errors momentarily recovers instead of
      // being dropped, and a host that's rate-limiting us gets breathing room.
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
    },
  );
  return { scanId, deduped: false };
}

/**
 * Enqueue a crawl of a site's origin. The one-time first-verify crawl is deduped via a stable jobId
 * (so the verification burst can't pile up redundant crawls); manual/scheduled crawls always run.
 * No-op when the site has no origin.
 */
export async function enqueueCrawl(
  siteId: string,
  origin: string | null,
  reason: CrawlJob["reason"] = "manual",
): Promise<void> {
  if (!origin) return;
  await getCrawlQueue().add(
    "crawl",
    { siteId, origin, reason },
    {
      // Stable id only for the first-verify crawl; undefined → unique id so re-crawls aren't blocked.
      ...(reason === "verified" ? { jobId: `crawl:${siteId}:verified` } : {}),
      removeOnComplete: 100,
      removeOnFail: 100,
      // Retry a crawl whose origin momentarily errored (don't strand a site on one bad fetch).
      attempts: 2,
      backoff: { type: "exponential", delay: 5000 },
    },
  );
}
