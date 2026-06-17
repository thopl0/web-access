import { and, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db, schema } from "@/lib/server/db";
import { getUserIssues } from "@/lib/server/issues";
import { explainRule } from "@/lib/explain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Quote a CSV field (wrap + double internal quotes). */
function csv(value: string | number): string {
  const s = String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Download a site's issues as CSV. Authenticated + ownership-checked (the token-free, account-scoped
 * counterpart to the public share link). One row per (site, rule) issue, matching the inbox.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const owned = await db
    .select({ id: schema.sites.id, name: schema.sites.name })
    .from(schema.sites)
    .where(and(eq(schema.sites.id, siteId), eq(schema.sites.ownerId, session.user.id)))
    .limit(1);
  const site = owned[0];
  if (!site) return new Response("Not found", { status: 404 });

  const issues = await getUserIssues(session.user.id, { siteId, view: "all" });

  const header = [
    "Severity",
    "Rule",
    "Title",
    "WCAG",
    "Occurrences",
    "Pages",
    "Status",
    "Description",
  ];
  const rows = issues.map((i) =>
    [
      i.impact ?? "advisory",
      i.ruleId,
      explainRule(i.ruleId)?.title ?? i.message,
      i.wcag.join("; "),
      i.totalSpots,
      i.pageCount,
      i.reopened ? "reopened" : i.status,
      i.message,
    ]
      .map(csv)
      .join(","),
  );
  const body = [header.map(csv).join(","), ...rows].join("\r\n");

  // Slugify the site name for the filename.
  const slug = site.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "site";

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${slug}-accessibility-issues.csv"`,
    },
  });
}
