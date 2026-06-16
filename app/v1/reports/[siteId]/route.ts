import { NextResponse } from "next/server";
import { getSiteReport } from "@/lib/server/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Latest scans (with findings) for a site. Kept for external/programmatic consumers; the dashboard
// itself calls getSiteReport() directly from server components instead of round-tripping HTTP.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  return NextResponse.json(await getSiteReport(siteId));
}
