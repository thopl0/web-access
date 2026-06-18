import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/server/db";
import { canViewSite } from "@/lib/server/image-access";
import { storage } from "@/lib/server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Full-page screenshot for a scan, streamed from object storage. Authorized for the site's owner or
 * a valid `?token=` (share link). Returns 404 (not 403) on auth failure so existence isn't leaked.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ scanId: string }> },
) {
  const { scanId } = await params;

  const scan = (
    await db
      .select({ siteId: schema.scans.siteId })
      .from(schema.scans)
      .where(eq(schema.scans.id, scanId))
      .limit(1)
  )[0];
  if (!scan) return new Response("Not found", { status: 404 });

  const token = req.nextUrl.searchParams.get("token");
  if (!(await canViewSite(scan.siteId, token))) return new Response("Not found", { status: 404 });

  const row = (
    await db
      .select({ objectKey: schema.scanShots.objectKey })
      .from(schema.scanShots)
      .where(eq(schema.scanShots.scanId, scanId))
      .limit(1)
  )[0];
  if (!row) return new Response("Not found", { status: 404 });

  const obj = await storage.get(row.objectKey);
  if (!obj) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(obj.body), {
    headers: {
      "Content-Type": obj.contentType,
      "Content-Length": String(obj.body.byteLength),
      // Private to the viewer; safe to cache briefly in their browser.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
