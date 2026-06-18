import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/server/db";
import { canViewSite } from "@/lib/server/image-access";
import { storage } from "@/lib/server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cropped element evidence for a finding, streamed from object storage. Authorized for the site's
 * owner or a valid `?token=` (share link). Returns 404 on auth failure so existence isn't leaked.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ findingId: string }> },
) {
  const { findingId } = await params;
  const id = Number(findingId);
  if (!Number.isInteger(id)) return new Response("Not found", { status: 404 });

  // findingId → scanId → siteId, plus the object key, in one join.
  const row = (
    await db
      .select({ siteId: schema.scans.siteId, objectKey: schema.evidence.objectKey })
      .from(schema.evidence)
      .innerJoin(schema.findings, eq(schema.findings.id, schema.evidence.findingId))
      .innerJoin(schema.scans, eq(schema.scans.id, schema.findings.scanId))
      .where(eq(schema.evidence.findingId, id))
      .limit(1)
  )[0];
  if (!row) return new Response("Not found", { status: 404 });

  const token = req.nextUrl.searchParams.get("token");
  if (!(await canViewSite(row.siteId, token))) return new Response("Not found", { status: 404 });

  const obj = await storage.get(row.objectKey);
  if (!obj) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(obj.body), {
    headers: {
      "Content-Type": obj.contentType,
      "Content-Length": String(obj.body.byteLength),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
