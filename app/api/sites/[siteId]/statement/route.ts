import { auth } from "@/auth";
import { getOwnedStatement, renderStatementDocument } from "@/lib/server/statement";
import { getUserEntitlements } from "@/lib/server/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Download the site's accessibility statement as a self-contained HTML document — the "publish it on
 * your own site" deliverable (our LiveStatement alternative). Authenticated + ownership-checked.
 * `?inline=1` renders it in the browser instead of forcing a download (used by the preview).
 */
export async function GET(req: Request, ctx: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const loaded = await getOwnedStatement(siteId, session.user.id);
  if (!loaded) return new Response("Not found", { status: 404 });

  // Downloadable artifacts are a paid-plan feature.
  if (!(await getUserEntitlements(session.user.id)).artifacts) {
    return new Response("Upgrade to Pro to download the accessibility statement.", { status: 403 });
  }

  const html = renderStatementDocument(loaded.model);

  // Slugify the site name for the filename.
  const slug =
    loaded.site.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "site";

  const inline = new URL(req.url).searchParams.get("inline") === "1";

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...(inline
        ? {}
        : { "content-disposition": `attachment; filename="${slug}-accessibility-statement.html"` }),
    },
  });
}
