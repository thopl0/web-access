import { NextResponse } from "next/server";
import { getRemediationManifest } from "@/lib/server/remediation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public, anonymous endpoint the embed fetches cross-origin to learn which safe attribute patches the
// owner approved for this site (Phase C runtime remediation). It mirrors /v1/ingest's CORS handling:
// the embed runs in the host page's third-party origin, so we reflect the Origin and allow credentials
// (browsers reject a credentialed request answered with the wildcard `*`).
//
// No auth: the manifest only ever exposes attribute patches the owner EXPLICITLY approved, on their
// OWN site, and only when their master opt-in is on (getRemediationManifest enforces both — an
// unknown site or a disabled toggle yields an empty manifest). So there's nothing here an anonymous
// caller shouldn't see; the data is already being applied to the public page.
function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    Vary: "Origin",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  } else {
    headers["Access-Control-Allow-Origin"] = "*";
  }
  return headers;
}

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const origin = req.headers.get("origin");
  const { siteId } = await params;

  const manifest = await getRemediationManifest(siteId);

  return NextResponse.json(manifest, {
    status: 200,
    headers: {
      ...corsHeaders(origin),
      // Cache-friendly: patches change rarely (only when the owner approves/toggles), and a short
      // staleness is fine for a temporary, non-visual patch. Lets a CDN absorb embed traffic.
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
