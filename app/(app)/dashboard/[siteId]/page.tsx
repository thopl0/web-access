import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { CircleCheck, ExternalLink, FileSearch, ShieldCheck } from "lucide-react";

import { SiteReport } from "@/components/dashboard/SiteReport";
import { StartHere } from "@/components/dashboard/StartHere";
import { ProUpsell } from "@/components/dashboard/ProUpsell";
import { ChangesSinceLastScan } from "@/components/dashboard/ChangesSinceLastScan";
import { SiteStatusChip } from "@/components/dashboard/SiteStatusChip";
import { InstallInstructions } from "@/components/dashboard/InstallInstructions";
import { VerifyPanel } from "@/components/dashboard/VerifyPanel";
import { SiteOverview } from "@/components/dashboard/SiteOverview";
import type { BoardPage } from "@/components/dashboard/SiteBoard";
import { CodeChip, EmptyState, PageHeader, Panel } from "@/components/dashboard/ui";
import { PageShell, Section } from "@/components/dashboard/layout";
import { Button } from "@/components/ui/Button";
import { verifySession } from "@/lib/server/dal";
import { db, schema } from "@/lib/server/db";
import { appOrigin } from "@/lib/server/origin";
import { embedSnippet } from "@/lib/embed";
import { getIssuesTrend, getSitePages, pathOf, rollupByRule, siteStartHere } from "@/lib/server/report";
import { getScanDelta } from "@/lib/server/verification";
import { explainRule } from "@/lib/explain";
import { SEVERITY_RANK, type Severity } from "@/lib/severity";
import { summarizeConformance } from "@/lib/wcag";

export const metadata: Metadata = { title: "Site report" };
export const dynamic = "force-dynamic";

export default async function SiteReportsPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const { userId } = await verifySession();

  // Ownership check — never trust the URL param. Unowned/other users' sites 404.
  const owned = await db
    .select()
    .from(schema.sites)
    .where(and(eq(schema.sites.id, siteId), eq(schema.sites.ownerId, userId)))
    .limit(1);
  const site = owned[0];
  if (!site) notFound();

  const verified = site.status === "verified";
  // `summary: true` loads the stored intelligent-report summary for the "Start here" card; the rest of
  // the page is unchanged. `siteStartHere` then picks the most-urgent stored summary or, failing that,
  // computes a deterministic site-wide legal-risk ranking — so the card is always populated.
  const { pages, counts, fixesLocked } = await getSitePages(siteId, { summary: true });
  const startHere = siteStartHere(pages);
  const rules = rollupByRule(pages);
  const hasPages = pages.length > 0;
  const conformance = summarizeConformance(rules, { evaluated: hasPages });
  const snippet = embedSnippet(await appOrigin(), site.id);

  // Verification loop (plan §8.5): compare the latest re-scan against the previous one so the report
  // can CONFIRM which fixes actually worked. Only meaningful once there are scans to compare.
  const scanDelta = hasPages ? await getScanDelta(siteId) : null;

  const trendData = hasPages
    ? await getIssuesTrend([siteId], 14)
    : { points: [], total: 0, criticalTotal: 0 };
  const trend = trendData.points;
  const found = trendData.total;
  const last7 = trend.slice(7).reduce((n, p) => n + p.total, 0);
  const prev7 = trend.slice(0, 7).reduce((n, p) => n + p.total, 0);
  const delta = prev7 === 0 ? (last7 > 0 ? 100 : null) : Math.round(((last7 - prev7) / prev7) * 100);
  const fmtDay = (iso: string) =>
    new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric" });

  const lastScan = pages.reduce<string | null>(
    (max, p) => (!max || p.scannedAt > max ? p.scannedAt : max),
    null,
  );

  // Compact conformance read-out — the full checklist lives on the Conformance tab.
  const aaOk = conformance.aaConformant;

  // "Site laid bare" board: each scanned page as its screenshot with issues pinned on it.
  const boardPages: BoardPage[] = pages.map((p) => {
    const markers = p.groups.flatMap((g) =>
      g.elements
        .filter((el) => el.box)
        .map((el) => ({
          ruleId: g.ruleId,
          x: el.box!.x,
          y: el.box!.y,
          w: el.box!.w,
          h: el.box!.h,
          impact: (g.impact ?? "minor") as Severity,
          title: explainRule(g.ruleId)?.title ?? g.message,
        })),
    );
    const issues = p.groups
      .map((g) => ({
        ruleId: g.ruleId,
        title: explainRule(g.ruleId)?.title ?? g.message,
        impact: (g.impact ?? null) as Severity | null,
        count: g.elements.length,
      }))
      .sort(
        (a, b) =>
          (a.impact ? SEVERITY_RANK[a.impact] : 99) - (b.impact ? SEVERITY_RANK[b.impact] : 99) ||
          b.count - a.count,
      );
    return {
      id: p.url,
      path: pathOf(p.url),
      siteId,
      counts: p.counts,
      ...(p.shot ? { shot: { src: p.shot.src, width: p.shot.width, height: p.shot.height } } : {}),
      markers,
      issues,
      grouped: p.grouped,
      pageCount: p.pageCount,
      status: p.status,
    } satisfies BoardPage;
  });

  // Lead the board with the home page (root path), then keep getSitePages' worst-first order for the
  // rest. Array.sort is stable, so the non-home cards retain their "most issues first" ordering. (Only
  // the board is reordered — `pages` stays worst-first so the "Start here" summary still leads with the
  // most urgent page.)
  boardPages.sort((a, b) => (a.path === "/" ? 0 : 1) - (b.path === "/" ? 0 : 1));

  return (
    <PageShell>
      <PageHeader
        titleId="reports-title"
        eyebrow="Accessibility report"
        title={site.name}
        lead={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <SiteStatusChip status={site.status} />
            <span className="inline-flex items-center gap-1.5">
              Site ID <CodeChip>{site.id}</CodeChip>
            </span>
            {site.origin ? (
              <a
                href={site.origin}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 break-all font-bold text-link no-underline underline-offset-2 hover:underline"
              >
                {site.origin.replace(/^https?:\/\//, "")}
                <ExternalLink className="size-3.5 shrink-0" aria-hidden strokeWidth={2.5} />
              </a>
            ) : null}
          </span>
        }
      />

      {!verified ? (
        <Panel className="mt-8">
          <h2 className="font-display text-lg font-bold text-fg">Finish setup</h2>
          <p className="mt-1 mb-5 text-sm text-fg-soft">
            Add the snippet to your site&apos;s <code className="font-mono text-xs">&lt;head&gt;</code>,
            then verify — scans and this report fill in automatically once it&apos;s live.
          </p>
          <InstallInstructions snippet={snippet} />
          <div className="mt-6 border-t border-[var(--color-panel-line)] pt-5">
            <VerifyPanel siteId={site.id} initialStatus={site.status} hasOrigin={Boolean(site.origin)} />
          </div>
        </Panel>
      ) : !hasPages ? (
        <EmptyState
          className="mt-8"
          icon={<FileSearch className="size-6" aria-hidden strokeWidth={2} />}
          title="No scans yet"
        >
          Your snippet is verified — once it runs on a page, scans and their findings show up here
          automatically.
        </EmptyState>
      ) : (
        <>
          {/* "Start here": the plain-English summary + legal-risk triage — the first thing an owner
              should read. Sits above the board so "what to fix first" leads the report. */}
          {startHere ? (
            <div className="mt-8">
              <StartHere startHere={startHere} />
            </div>
          ) : null}

          {/* Verification loop: what the latest re-scan CONFIRMS was fixed (and what's newly
              introduced). Self-suppresses on a first scan or when nothing changed. */}
          {scanDelta?.hasPrevious && (scanDelta.resolved.length > 0 || scanDelta.introduced.length > 0) ? (
            <div className={startHere ? "mt-6" : "mt-8"}>
              <ChangesSinceLastScan delta={scanDelta} />
            </div>
          ) : null}

          {/* Free owners (fixes withheld): lead with what Pro adds, right where they've just read
              "what to fix first" — so the next step is upgrading to actually fix it. */}
          {fixesLocked ? (
            <div className={startHere ? "mt-6" : "mt-8"}>
              <ProUpsell />
            </div>
          ) : null}

          {/* Board + the metric band and health panel, which re-scope to a page when one is opened. */}
          <SiteOverview
            pages={boardPages}
            siteCounts={counts}
            pageCount={pages.length}
            trend={trend}
            found={found}
            delta={delta}
            lastScanLabel={lastScan ? fmtDay(lastScan.slice(0, 10)) : "—"}
          />

          {/* Conformance: a slim read-out that links to the full WCAG checklist tab. */}
          <Section title="Conformance">
            <Panel>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  {aaOk ? (
                    <CircleCheck className="size-6 shrink-0 text-green" aria-hidden strokeWidth={2.25} />
                  ) : (
                    <ShieldCheck className="size-6 shrink-0 text-[color-mix(in_srgb,var(--color-fg)_60%,var(--yellow))]" aria-hidden strokeWidth={2.25} />
                  )}
                  <div className="min-w-0">
                    <p className="font-display font-bold text-fg">
                      {aaOk ? "WCAG 2.1 A/AA conformant" : `${conformance.blockingAA} ${conformance.blockingAA === 1 ? "criterion" : "criteria"} failing`}
                    </p>
                    <p className="mt-0.5 text-sm text-fg-soft">
                      {aaOk
                        ? "Automated checks pass — some criteria still need manual review."
                        : "Plus manual-review criteria the automation can't judge — see the full checklist."}
                    </p>
                  </div>
                </div>
                <Button href={`/dashboard/${siteId}/conformance`} variant="outline" size="sm">
                  View full WCAG checklist →
                </Button>
              </div>
            </Panel>
          </Section>

          {/* Filterable report. Defaults to grouping by issue type so a problem that
              recurs on many pages reads as one fixable entry, not N repeats.
              SiteReport renders its own control bar + results heading, so the Section
              title here is the only "Issues" heading (no double heading). */}
          <Section title="Issues">
            {fixesLocked ? (
              <Panel className="mb-6 border-l-4 border-l-[var(--color-link)]">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-display font-bold text-fg">
                      Fixes are a Pro feature
                    </p>
                    <p className="mt-1 text-sm text-fg-soft">
                      Your free plan shows every issue and why it matters. Upgrade to Pro for the
                      paste-ready before→after fix on each one, AI judgment, and the copy-paste
                      builder prompt.
                    </p>
                  </div>
                  <Button href="/pricing" variant="blue" size="sm" className="shrink-0">
                    Upgrade to Pro
                  </Button>
                </div>
              </Panel>
            ) : null}
            <SiteReport rules={rules} pages={pages} counts={counts} siteId={siteId} />
          </Section>
        </>
      )}
    </PageShell>
  );
}
