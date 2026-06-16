import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { toReport } from "@/lib/server/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A single scan by id.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ scanId: string }> },
) {
  const { scanId } = await params;
  const found = await db.select().from(schema.scans).where(eq(schema.scans.id, scanId)).limit(1);
  const scan = found[0];
  if (!scan) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const rows = await db.select().from(schema.findings).where(eq(schema.findings.scanId, scanId));
  return NextResponse.json(toReport(scan, rows));
}
