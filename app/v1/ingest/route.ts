import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { IngestRequest } from "@web-access/shared";
import { db, schema } from "@/lib/server/db";
import { getRenderQueue } from "@/lib/server/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The embed posts from third-party origins, so this endpoint is open CORS (it was `origin: true`
// on the old Fastify server). It only accepts a validated, minimal payload.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

// What the embed calls. Dedups per (site, release, template) and enqueues a render job.
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const parsed = IngestRequest.safeParse(body);
  if (!parsed.success) {
    return json({ error: "invalid_payload", details: parsed.error.flatten() }, 400);
  }
  const { siteId, url, releaseId, templateFingerprint, renderedHtml } = parsed.data;
  const scanId = randomUUID();

  const inserted = await db
    .insert(schema.scans)
    .values({ id: scanId, siteId, url, releaseId, templateFingerprint, status: "queued" })
    .onConflictDoNothing({
      target: [schema.scans.siteId, schema.scans.releaseId, schema.scans.templateFingerprint],
    })
    .returning({ id: schema.scans.id });

  if (inserted.length === 0) {
    // Already scanned this (site, release, template) — dedup, don't re-render.
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
    return json({ scanId: existing[0]?.id ?? null, deduped: true });
  }

  await getRenderQueue().add(
    "scan",
    { scanId, url, ...(renderedHtml ? { renderedHtml } : {}) },
    { removeOnComplete: 500, removeOnFail: 500, attempts: 2 },
  );
  return json({ scanId, deduped: false }, 202);
}
