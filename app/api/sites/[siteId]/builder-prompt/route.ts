import { and, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db, schema } from "@/lib/server/db";
import { getSitePages } from "@/lib/server/report";
import { explainRule } from "@/lib/explain";
import { getUserEntitlements } from "@/lib/server/entitlements";
import { isPlatform, PLATFORM_LABELS, type Platform } from "@/lib/platform";
import {
  buildBuilderPrompt,
  type BuilderPromptIssue,
} from "@/lib/packages/analyzers/fix/builderPrompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Generate a site's paste-ready remediation message for the owner's PLATFORM — the product's
 * distribution wedge. Authenticated + ownership-checked exactly like the fix-pack route next door,
 * and gated behind the same `artifacts` (paid-plan) entitlement.
 *
 * The platform is resolved in this order: an explicit `?platform=` query value (validated with
 * `isPlatform`), else the site's saved `platform`, else `"other"` (CMS-style steps). When a valid
 * `?platform=` is supplied and differs from what's stored, we persist it so the picker remembers the
 * owner's choice (a clean single-column write, mirroring the other `schema.sites` updates).
 *
 * We load the latest scan's findings via `getSitePages({ evidence: true })` — which attaches each
 * element's AI explanation and concrete before→after fix — flatten the PageReport tree into
 * `BuilderPromptIssue[]` (preferring the element's explanation, falling back to the rule's curated
 * explainer), then hand them to `buildBuilderPrompt`. That generator NEVER throws: when the AI tier is
 * unconfigured or the model call fails it returns a deterministic template, so this route always
 * responds with a usable document.
 */
export async function GET(req: Request, ctx: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const owned = await db
    .select({
      id: schema.sites.id,
      name: schema.sites.name,
      platform: schema.sites.platform,
    })
    .from(schema.sites)
    .where(and(eq(schema.sites.id, siteId), eq(schema.sites.ownerId, session.user.id)))
    .limit(1);
  const site = owned[0];
  if (!site) return new Response("Not found", { status: 404 });

  // Downloadable artifacts are a paid-plan feature (same gate as the fix pack / CSV export).
  if (!(await getUserEntitlements(session.user.id)).artifacts) {
    return new Response("Upgrade to Pro to generate a builder prompt.", { status: 403 });
  }

  // Resolve the platform: explicit query → saved → "other". Persist a new, valid query choice.
  const requested = new URL(req.url).searchParams.get("platform");
  let platform: Platform = "other";
  if (requested && isPlatform(requested)) {
    platform = requested;
    if (site.platform !== requested) {
      await db
        .update(schema.sites)
        .set({ platform: requested })
        .where(eq(schema.sites.id, siteId));
    }
  } else if (site.platform && isPlatform(site.platform)) {
    platform = site.platform;
  }

  // evidence:true loads the per-element explanations and fixes we project into issues.
  const { pages } = await getSitePages(siteId, { evidence: true });

  const issues: BuilderPromptIssue[] = [];
  for (const page of pages) {
    for (const group of page.groups) {
      const explainer = explainRule(group.ruleId);
      for (const el of group.elements) {
        // Prefer the AI's element-specific plain-language text; fall back to the rule's curated
        // explainer, then the group's raw developer message. The generator strips selectors before
        // any model call — we pass them only so it can dedupe.
        const what = el.explanation?.what ?? explainer?.what ?? group.message;
        const fix = el.explanation?.fix ?? explainer?.fix ?? group.message;
        issues.push({
          ruleId: group.ruleId,
          wcag: group.wcag,
          impact: group.impact,
          pageUrl: page.url,
          selector: el.selector,
          what,
          fix,
          ...(el.fix?.before ? { before: el.fix.before } : {}),
          ...(el.fix?.after ? { after: el.fix.after } : {}),
        });
      }
    }
  }

  const result = await buildBuilderPrompt(issues, { platform, siteName: site.name });

  // Slugify the site name for the filename (same rule as the CSV / fix-pack routes).
  const slug = site.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "site";
  const platformSlug = PLATFORM_LABELS[platform].toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return new Response(result.prompt, {
    status: 200,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${slug}-${platformSlug}-builder-prompt.md"`,
    },
  });
}
