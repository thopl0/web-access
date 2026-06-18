import { and, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db, schema } from "@/lib/server/db";
import { getSitePages, pathOf } from "@/lib/server/report";
import { explainRule } from "@/lib/explain";
import { getUserEntitlements } from "@/lib/server/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Download a site's suggested code fixes as a single Markdown "fix pack". Authenticated +
 * ownership-checked (same shape as the CSV export route next door). Unlike the CSV — which lists
 * issues — this emits the concrete before→after markup we attach to each affected element, grouped
 * PAGE → RULE → ELEMENT, so an owner can hand the whole document to a developer or AI builder.
 *
 * Only elements that actually carry a `fix` are included; pages/rules with no fixable elements are
 * skipped entirely. `evidence: true` is what loads the fixes onto the elements.
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

  // Downloadable artifacts are a paid-plan feature.
  if (!(await getUserEntitlements(session.user.id)).artifacts) {
    return new Response("Upgrade to Pro to download the fix pack.", { status: 403 });
  }

  // evidence:true loads the per-element fixes (and screenshots) we need here.
  const { pages } = await getSitePages(siteId, { evidence: true });

  const lines: string[] = [];
  lines.push(`# Accessibility fixes — ${site.name}`);
  lines.push("");
  lines.push(`Generated ${new Date().toISOString().slice(0, 10)}`);
  lines.push("");

  let totalFixes = 0;

  for (const page of pages) {
    // Rules on this page that have at least one fixable element.
    const fixableGroups = page.groups
      .map((group) => ({
        group,
        elements: group.elements.filter((el) => el.fix),
      }))
      .filter((g) => g.elements.length > 0);
    if (!fixableGroups.length) continue; // skip pages with nothing to suggest

    lines.push(`## ${pathOf(page.url)}`);
    lines.push("");

    for (const { group, elements } of fixableGroups) {
      const title = explainRule(group.ruleId)?.title ?? group.message;
      lines.push(`### ${title}`);
      lines.push("");
      lines.push(`Rule: \`${group.ruleId}\``);
      if (group.wcag.length) lines.push(`WCAG: ${group.wcag.join(", ")}`);
      lines.push("");

      for (const el of elements) {
        const fix = el.fix!; // guaranteed by the filter above
        totalFixes += 1;
        lines.push(`- \`${el.selector}\``);
        lines.push("");
        lines.push("Current:");
        lines.push("");
        lines.push("```html");
        lines.push(fix.before);
        lines.push("```");
        lines.push("");
        lines.push("Should be:");
        lines.push("");
        lines.push("```html");
        lines.push(fix.after);
        lines.push("```");
        lines.push("");
        if (fix.needsReview) {
          lines.push(`> ⚠️ **Needs review**${fix.note ? ` — ${fix.note}` : ""}`);
          lines.push("");
        }
      }
    }
  }

  // Zero fixes anywhere — still return a valid, friendly document.
  if (totalFixes === 0) {
    lines.push("No automated fixes are available yet.");
    lines.push("");
    lines.push(
      "Once a scan generates concrete code suggestions for this site, they'll appear here.",
    );
    lines.push("");
  }

  const body = lines.join("\n");

  // Slugify the site name for the filename (same rule as the CSV route).
  const slug = site.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "site";

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${slug}-accessibility-fixes.md"`,
    },
  });
}
