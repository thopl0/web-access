import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { CodeChip, PageHeader, Panel } from "@/components/dashboard/ui";
import { SiteStatusChip } from "@/components/dashboard/SiteStatusChip";
import { VerifyPanel } from "@/components/dashboard/VerifyPanel";
import { InstallInstructions } from "@/components/dashboard/InstallInstructions";
import {
  DeleteSiteForm,
  GeneralForm,
  PauseToggle,
  ScanConfigForm,
} from "@/components/dashboard/SiteSettingsForms";
import { ShareToggle } from "@/components/dashboard/ShareExport";
import { RuntimeFixSettings } from "@/components/dashboard/RuntimeFixSettings";
import { CssFixToggle } from "@/components/dashboard/CssFixToggle";
import { AutoFixList } from "@/components/dashboard/AutoFixList";
import { listRemediations, listRuleAutofix } from "@/app/actions/remediation";
import { verifySession } from "@/lib/server/dal";
import { db, schema } from "@/lib/server/db";
import { appOrigin } from "@/lib/server/origin";
import { embedSnippet } from "@/lib/embed";
import { explainRule } from "@/lib/explain";

export const metadata: Metadata = { title: "Site settings" };
export const dynamic = "force-dynamic";

/** A labelled settings section. */
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

export default async function SiteSettingsPage({
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
  const snippet = embedSnippet(origin, site.id);
  const remediations = await listRemediations(site.id);
  const autoFixRules = (await listRuleAutofix(site.id)).map((r) => ({
    ruleId: r.ruleId,
    title: explainRule(r.ruleId)?.title ?? r.ruleId,
  }));

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8">
      <PageHeader
        titleId="settings-title"
        eyebrow="Site settings"
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
        <Section title="General" description="Name and address of the site.">
          <GeneralForm siteId={site.id} name={site.name} origin={site.origin} />
        </Section>

        <Section
          title="Install & verification"
          description="The one-line snippet for this site, and its install status."
        >
          {site.status === "verified" ? (
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-3 rounded-xl border border-green/40 bg-green/10 px-4 py-3 text-sm text-fg">
                Snippet verified — scans run automatically.
              </div>
              <InstallInstructions snippet={snippet} />
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <InstallInstructions snippet={snippet} />
              <VerifyPanel siteId={site.id} initialStatus={site.status} hasOrigin={Boolean(site.origin)} />
            </div>
          )}
        </Section>

        <Section
          title="Pages to scan"
          description="Control which pages we monitor and how we discover them."
        >
          <ScanConfigForm siteId={site.id} config={site.scanConfig} />
        </Section>

        <Section title="Monitoring" description="Pause scanning without losing your data.">
          <PauseToggle siteId={site.id} status={site.status} />
        </Section>

        <Section
          title="Sharing"
          description="Share a read-only report link. Downloadable reports live in the Reports tab."
        >
          <ShareToggle siteId={site.id} origin={origin} initialToken={site.shareToken} />
        </Section>

        <Section
          title="Auto-apply fixes to your live site"
          description="Automatically apply approved fixes to your live site so visitors get a more accessible page right away — while you (or your developer) update the original."
        >
          <RuntimeFixSettings
            siteId={site.id}
            initialEnabled={site.runtimeRemediation}
            remediations={remediations}
          />
        </Section>

        <Section
          title="Experimental CSS fixes"
          description="Let approved fixes restyle your live site to address visual issues like color contrast and small tap targets. These change how your pages look."
        >
          <CssFixToggle siteId={site.id} initialEnabled={site.cssRemediation} />
        </Section>

        <Section
          title="Auto-fix issue types going forward"
          description="Issue types you've chosen to fix automatically. New occurrences are patched live on every scan (safe attributes only), so these stop coming back in your inbox."
        >
          <AutoFixList siteId={site.id} rules={autoFixRules} />
        </Section>

        <div className="rounded-[14px] border-[3px] border-pink/40 p-5 sm:p-6">
          <h2 className="font-display text-lg font-bold text-pink">Danger zone</h2>
          <p className="mt-1 mb-5 text-sm text-fg-soft">
            Deleting a site permanently removes it and all of its scans, issues, and history. This
            can&apos;t be undone.
          </p>
          <DeleteSiteForm siteId={site.id} name={site.name} />
        </div>
      </div>
    </div>
  );
}
