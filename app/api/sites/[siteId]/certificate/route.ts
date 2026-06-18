import { auth } from "@/auth";
import { getOwnedCertificate, renderCertificateDocument } from "@/lib/server/certificate";
import { htmlToPdf } from "@/lib/server/pdf";
import { getUserEntitlements } from "@/lib/server/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Download the site's dated conformance certificate. Authenticated + ownership-checked.
 *   default      → PDF (rendered from the same Chromium the worker uses)
 *   ?format=html → the printable HTML (used for an in-browser preview, and as a graceful fallback
 *                  if PDF rendering is unavailable in this process).
 */
export async function GET(req: Request, ctx: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const loaded = await getOwnedCertificate(siteId, session.user.id);
  if (!loaded) return new Response("Not found", { status: 404 });

  // Downloadable artifacts are a paid-plan feature.
  if (!(await getUserEntitlements(session.user.id)).artifacts) {
    return new Response("Upgrade to Pro to download the conformance certificate.", { status: 403 });
  }

  const html = renderCertificateDocument(loaded.model);
  const slug =
    loaded.site.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "site";

  const wantsHtml = new URL(req.url).searchParams.get("format") === "html";

  if (!wantsHtml) {
    try {
      const pdf = await htmlToPdf(html);
      return new Response(new Uint8Array(pdf), {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="${slug}-accessibility-certificate.pdf"`,
        },
      });
    } catch {
      // Chromium unavailable in this process — fall through to the printable HTML so the download
      // still works (the user can print-to-PDF from the browser).
    }
  }

  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
