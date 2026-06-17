import type { Metadata } from "next";

import { SiteWizard } from "@/components/dashboard/SiteWizard";
import { BackLink, PageHeader } from "@/components/dashboard/ui";
import { verifySession } from "@/lib/server/dal";

export const metadata: Metadata = { title: "Add a site" };
export const dynamic = "force-dynamic";

export default async function NewSitePage() {
  // Gate the page (the action re-checks authoritatively too).
  await verifySession();

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8">
      <BackLink href="/dashboard">Back to overview</BackLink>
      <PageHeader
        className="mt-4"
        titleId="new-site-title"
        eyebrow="Add a site"
        title="Set up monitoring"
        lead="Name your site, drop in the snippet, and we'll verify it's live — then accessibility scans run automatically on every release."
      />
      <div className="mt-8">
        <SiteWizard />
      </div>
    </div>
  );
}
