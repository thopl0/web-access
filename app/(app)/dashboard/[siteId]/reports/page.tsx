import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { CodeChip, PageHeader, Panel } from "@/components/dashboard/ui";
import { SiteStatusChip } from "@/components/dashboard/SiteStatusChip";
import { StatementSettings } from "@/components/dashboard/StatementSettings";
import { BuilderPromptCard } from "@/components/dashboard/BuilderPromptCard";
import { isPlatform, type Platform } from "@/lib/platform";
import { Award, Download, FileText } from "lucide-react";
import { verifySession } from "@/lib/server/dal";
import { db, schema } from "@/lib/server/db";
import { getSitePages } from "@/lib/server/report";
import { appOrigin } from "@/lib/server/origin";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

/** A labelled reports section. */
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Panel>
      <h2 className="font-display text-lg font-bold text-fg">{title}</h2>
      {description ? <p className="mt-1 mb-5 text-sm text-fg-soft">{description}</p> : <div className="mb-5" />}
      {children}
    </Panel>
  );
}

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const { userId } = await verifySession();

  const owned = await db
    .select()
    .from(schema.sites)
    .where(and(eq(schema.sites.id, siteId), eq(schema.sites.ownerId, userId)))
    .limit(1);
  const site = owned[0];
  if (!site) notFound();

  const origin = await appOrigin();
  const { pages } = await getSitePages(siteId);
  const hasPages = pages.length > 0;

  // The saved platform may be null (never set) or stale — narrow to a known Platform, default "other".
  const platform: Platform = site.platform && isPlatform(site.platform) ? site.platform : "other";

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8">
      <PageHeader
        titleId="reports-title"
        eyebrow="Reports"
        title={site.name}
        lead={
          <span className="inline-flex flex-wrap items-center gap-3">
            <SiteStatusChip status={site.status} />
            <span className="inline-flex items-center gap-1.5 text-fg-soft">
              Site ID <CodeChip>{site.id}</CodeChip>
            </span>
          </span>
        }
      />

      <div className="mt-8 flex flex-col gap-6">
        <Section
          title="Compliance documents"
          description="Publish or download the artifacts that demonstrate this site's accessibility status."
        >
          <div className="flex flex-col gap-6">
            <StatementSettings
              siteId={site.id}
              origin={origin}
              config={site.statementConfig}
              initialToken={site.statementToken}
            />
            {hasPages ? (
              <div className="flex flex-wrap gap-3 border-t border-[var(--color-panel-line)] pt-5">
                <a
                  href={`/api/sites/${site.id}/certificate`}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[var(--color-panel-line-strong)] bg-surface px-3 py-2 text-sm font-bold text-fg no-underline transition-colors hover:bg-[color-mix(in_srgb,var(--color-fg)_5%,transparent)]"
                >
                  <Award className="size-4" strokeWidth={2.5} aria-hidden />
                  Certificate (PDF)
                </a>
                <a
                  href={`/api/sites/${site.id}/vpat`}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[var(--color-panel-line-strong)] bg-surface px-3 py-2 text-sm font-bold text-fg no-underline transition-colors hover:bg-[color-mix(in_srgb,var(--color-fg)_5%,transparent)]"
                >
                  <FileText className="size-4" strokeWidth={2.5} aria-hidden />
                  VPAT (HTML)
                </a>
              </div>
            ) : (
              <p className="border-t border-[var(--color-panel-line)] pt-5 text-sm text-fg-soft">
                The conformance certificate and VPAT become available once at least one page has been
                scanned.
              </p>
            )}
          </div>
        </Section>

        <Section
          title="Developer handoff"
          description="Hand the work off to whoever (or whatever) builds your site."
        >
          <div className="flex flex-col gap-6">
            <div>
              <p className="mb-3 text-sm text-fg-soft">
                Generate one paste-ready message that fixes every issue, tailored to the tool you
                build your site with.
              </p>
              <BuilderPromptCard siteId={site.id} initialPlatform={platform} />
            </div>
            <div className="flex flex-wrap gap-3 border-t border-[var(--color-panel-line)] pt-5">
              <a
                href={`/api/sites/${site.id}/fixpack`}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[var(--color-panel-line-strong)] bg-surface px-3 py-2 text-sm font-bold text-fg no-underline transition-colors hover:bg-[color-mix(in_srgb,var(--color-fg)_5%,transparent)]"
              >
                <Download className="size-4" strokeWidth={2.5} aria-hidden />
                Download fix pack (Markdown)
              </a>
            </div>
          </div>
        </Section>

        <Section
          title="Data export"
          description="Export the raw issues for your own tooling."
        >
          <div className="flex flex-wrap gap-3">
            <a
              href={`/api/sites/${site.id}/export`}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[var(--color-panel-line-strong)] bg-surface px-3 py-2 text-sm font-bold text-fg no-underline transition-colors hover:bg-[color-mix(in_srgb,var(--color-fg)_5%,transparent)]"
            >
              <Download className="size-4" strokeWidth={2.5} aria-hidden />
              Download issues (CSV)
            </a>
          </div>
        </Section>
      </div>
    </div>
  );
}
