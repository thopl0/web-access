import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { IngestRequest, pathAllowed } from "@web-access/shared";
import { db, schema } from "@/lib/server/db";
import { enqueueCrawl, enqueueScan } from "@/lib/server/scan";
import { notifySiteVerified } from "@/lib/server/notify";
import { ownerScanUsage, withinScanQuota } from "@/lib/server/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The embed posts from third-party origins, so this endpoint is open CORS (it was `origin: true`
// on the old Fastify server, which *reflects* the caller's origin). It only accepts a validated,
// minimal payload.
//
// We reflect the Origin and allow credentials instead of replying with `*`: the embed's primary
// transport is navigator.sendBeacon, which is ALWAYS sent in credentials mode "include", and
// browsers reject a credentialed request whose Access-Control-Allow-Origin is the wildcard `*`.
function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    Vary: "Origin",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  } else {
    // No Origin header (curl, same-origin, server-to-server) — wildcard is fine and avoids
    // pinning to a single caller.
    headers["Access-Control-Allow-Origin"] = "*";
  }
  return headers;
}

function json(data: unknown, status = 200, origin: string | null = null) {
  return NextResponse.json(data, { status, headers: corsHeaders(origin) });
}

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

// What the embed calls. Dedups per (site, release, template) and enqueues a render job.
export async function POST(req: Request) {
  const origin = req.headers.get("origin");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400, origin);
  }

  const parsed = IngestRequest.safeParse(body);
  if (!parsed.success) {
    return json({ error: "invalid_payload", details: parsed.error.flatten() }, 400, origin);
  }
  const { siteId, url, releaseId, templateFingerprint, renderedHtml } = parsed.data;

  // Only accept scans for registered sites.
  const site = await db
    .select({
      id: schema.sites.id,
      origin: schema.sites.origin,
      status: schema.sites.status,
      scanConfig: schema.sites.scanConfig,
    })
    .from(schema.sites)
    .where(eq(schema.sites.id, siteId))
    .limit(1);
  if (site.length === 0) {
    return json({ error: "unknown_site" }, 403, origin);
  }
  const siteRow = site[0]!;

  // Passive verification + "script still live" heartbeat: every accepted ping records lastSeenAt,
  // and a site's FIRST ping flips it pending → verified. (The active "Check now" path does the
  // same via checkInstall.)
  const justVerified = siteRow.status === "pending";
  await db
    .update(schema.sites)
    .set({
      lastSeenAt: new Date(),
      ...(justVerified ? { status: "verified", verifiedAt: new Date() } : {}),
    })
    .where(eq(schema.sites.id, siteId));

  // First-ever verification: kick off a one-time crawl to discover the rest of the site's pages
  // (best-effort — never block the ping on it).
  if (justVerified) {
    if (siteRow.scanConfig.autoCrawl) {
      void enqueueCrawl(siteId, siteRow.origin, "verified").catch(() => {});
    }
    void notifySiteVerified(siteId).catch(() => {});
  }

  // Owner paused monitoring — keep the heartbeat above, but don't scan.
  if (siteRow.status === "paused") {
    return json({ skipped: "paused" }, 200, origin);
  }
  // Respect the site's page-access control (allow/deny path globs).
  if (!pathAllowed(url, siteRow.scanConfig)) {
    return json({ skipped: "path_excluded" }, 200, origin);
  }

  // Monthly scan-quota gate. Return 200 (so the embed treats it as accepted and doesn't retry) but
  // DON'T enqueue once the owner is over budget. Unowned system sites have no quota.
  const usage = await ownerScanUsage(siteId);
  if (usage && !withinScanQuota(usage.plan, usage.usedThisMonth)) {
    console.log(
      `[ingest] scan quota reached for site ${siteId} (owner ${usage.ownerId}, plan ${usage.plan}) — skipping`,
    );
    return json({ skipped: "quota_exceeded" }, 200, origin);
  }

  const { scanId, deduped } = await enqueueScan({
    siteId,
    url,
    releaseId,
    templateFingerprint,
    ...(renderedHtml ? { renderedHtml } : {}),
  });
  return json({ scanId, deduped }, deduped ? 200 : 202, origin);
}
