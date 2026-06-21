import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import {
  CircleCheck,
  ExternalLink,
  FileSearch,
  MinusCircle,
  XCircle,
} from "lucide-react";

import { SiteStatusChip } from "@/components/dashboard/SiteStatusChip";
import { WcagScorecard, EaaReadiness } from "@/components/dashboard/Compliance";
import { PrintButton } from "@/components/dashboard/PrintButton";
import { ConformanceFilter } from "@/components/dashboard/ConformanceFilter";
import { ruleTitle } from "@/components/dashboard/IssueDetail";
import {
  CodeChip,
  EmptyState,
  PageHeader,
  Panel,
} from "@/components/dashboard/ui";
import { PageShell, Section, MetricStrip, type Metric } from "@/components/dashboard/layout";
import { verifySession } from "@/lib/server/dal";
import { db, schema } from "@/lib/server/db";
import { getSitePages, rollupByRule } from "@/lib/server/report";
import type { RuleRollup } from "@/lib/server/report";
import {
  buildChecklist,
  summarizeConformance,
  PRINCIPLES,
  type ChecklistCriterion,
  type Coverage,
  type CriterionStatus,
  type Principle,
} from "@/lib/wcag";

export const metadata: Metadata = { title: "WCAG conformance" };
export const dynamic = "force-dynamic";

const PRINCIPLE_ORDER: Principle[] = [1, 2, 3, 4];

/** Plain-language coverage note — surfaces WHY a "pass" or "not tested" can't be taken as gospel. */
const COVERAGE_NOTE: Record<Coverage, string> = {
  automatable: "Automated check",
  partial: "Partial automated coverage",
  manual: "Manual review",
};

/**
 * Status pill: icon + text so meaning never rides on color alone.
 *   fail        → pink XCircle "Failing"
 *   pass        → green CircleCheck "Passed (automated)" — passed our checks, not a conformance guarantee
 *   not-tested  → neutral MinusCircle/CircleDashed "Not tested" — manual-only, or no scan data
 */
function StatusPill({ status }: { status: CriterionStatus }) {
  if (status === "fail") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-pink/40 bg-pink/10 px-2.5 py-0.5 text-xs font-bold text-pink">
        <XCircle className="size-3.5 shrink-0" aria-hidden strokeWidth={2.5} />
        Failing
      </span>
    );
  }
  if (status === "pass") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-green/40 bg-green/10 px-2.5 py-0.5 text-xs font-bold text-green">
        <CircleCheck className="size-3.5 shrink-0" aria-hidden strokeWidth={2.5} />
        Passed (automated)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-panel-line-strong)] px-2.5 py-0.5 text-xs font-bold text-fg-soft">
      <MinusCircle className="size-3.5 shrink-0" aria-hidden strokeWidth={2.5} />
      Not tested
    </span>
  );
}

/** Small A / AA level chip. */
function LevelTag({ level }: { level: "A" | "AA" }) {
  return (
    <CodeChip className="px-1.5 font-bold">
      {level}
    </CodeChip>
  );
}

export default async function ConformancePage({
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

  const { pages } = await getSitePages(siteId);
  const hasPages = pages.length > 0;
  const rules = rollupByRule(pages);
  const checklist = buildChecklist(rules, { evaluated: hasPages });
  const conformance = summarizeConformance(rules, { evaluated: hasPages });

  // sc → failing rules, so each failing criterion can link to the concrete issue(s).
  const rulesBySc = new Map<string, RuleRollup[]>();
  for (const rule of rules) {
    for (const sc of rule.wcag) {
      const list = rulesBySc.get(sc);
      if (list) list.push(rule);
      else rulesBySc.set(sc, [rule]);
    }
  }

  const { summary } = checklist;
  const automated = summary.passed; // passed automated checks
  const checkedAutomatically = summary.total - summary.manualTotal; // automatable + partial

  const metrics: Metric[] = [
    {
      label: "Failing",
      value: summary.failed,
      ...(summary.failed > 0 ? { severity: "critical" as const } : {}),
      hint: summary.failed > 0 ? "Open issues map here" : "None failing",
    },
    { label: "Passed (automated)", value: automated, hint: "Cleared our checks" },
    {
      label: "Needs manual review",
      value: summary.manualTotal,
      hint: `of ${summary.total} criteria`,
    },
  ];

  return (
    <PageShell>
      <PageHeader
        titleId="conformance-title"
        eyebrow="WCAG 2.1 conformance"
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
        actions={
          hasPages ? (
            <div className="flex flex-wrap items-center gap-2">
              <PrintButton />
            </div>
          ) : undefined
        }
      />

      {!hasPages ? (
        <EmptyState
          className="mt-8"
          icon={<FileSearch className="size-6" aria-hidden strokeWidth={2} />}
          title="No scan data yet"
        >
          Conformance can&apos;t be assessed until at least one page has been scanned. Once your
          snippet runs on a page, every WCAG&nbsp;2.1 A/AA criterion shows up here with an honest
          status.
        </EmptyState>
      ) : (
        <>
          {/* Headline conformance facts — one calm band. */}
          <div className="mt-6">
            <MetricStrip items={metrics} />
          </div>

          {/* Honesty callout — one concise paragraph, not a wall. */}
          <section
            aria-labelledby="conformance-honesty"
            className="mt-6 rounded-2xl border border-[var(--color-panel-line)] bg-[color-mix(in_srgb,var(--color-fg)_3%,transparent)] px-4 py-3.5 sm:px-5"
          >
            <h2
              id="conformance-honesty"
              className="font-display text-sm font-bold uppercase tracking-wide text-fg-soft"
            >
              How to read this report
            </h2>
            <p className="mt-1.5 max-w-3xl text-sm text-fg">
              Automated testing reliably covers only a portion of WCAG. We checked{" "}
              <strong className="font-bold">{checkedAutomatically}</strong> of {summary.total}{" "}
              criteria automatically;{" "}
              <strong className="font-bold">{summary.manualTotal} require manual review</strong> and
              are marked <em className="not-italic font-bold">Not tested</em>. A{" "}
              <em className="not-italic font-bold">Passed (automated)</em> result means it cleared
              the checks we can run — not a guarantee of full conformance.
            </p>
          </section>

          {/* At-a-glance A/AA + EAA — reuse the shared scorecards, under one section. */}
          <Section title="Level A / AA at a glance">
            <div className="grid gap-4 lg:grid-cols-3">
              <Panel className="lg:col-span-2">
                <WcagScorecard report={conformance} />
              </Panel>
              <EaaReadiness report={conformance} />
            </div>
          </Section>

          {/* The checklist document — one section per POUR principle. */}
          <Section title="Success criteria" className="mt-10">
            <ConformanceFilter>
              <div className="flex flex-col gap-10">
                {PRINCIPLE_ORDER.map((p) => (
                  <PrincipleSection
                    key={p}
                    principle={p}
                    criteria={checklist.byPrinciple[p]}
                    rulesBySc={rulesBySc}
                    siteId={siteId}
                  />
                ))}
              </div>
            </ConformanceFilter>
          </Section>
        </>
      )}
    </PageShell>
  );
}

/** One POUR principle as a document section with a real semantic table of its criteria. */
function PrincipleSection({
  principle,
  criteria,
  rulesBySc,
  siteId,
}: {
  principle: Principle;
  criteria: ChecklistCriterion[];
  rulesBySc: Map<string, RuleRollup[]>;
  siteId: string;
}) {
  const headingId = `principle-${principle}`;
  const failing = criteria.filter((c) => c.status === "fail").length;
  const manualCount = criteria.filter((c) => c.coverage === "manual").length;

  return (
    <section aria-labelledby={headingId}>
      <div className="mb-3 flex items-baseline gap-3">
        <h3 id={headingId} className="font-display text-lg font-bold text-fg">
          <span className="text-fg-soft">{principle}.</span> {PRINCIPLES[principle]}
        </h3>
        <span className="text-sm text-fg-soft">
          {failing > 0 ? `${failing} failing` : "No failures"} · {criteria.length} criteria
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--color-panel-line)]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">
              WCAG 2.1 {PRINCIPLES[principle]} success criteria and their automated status
            </caption>
            <thead>
              <tr className="border-b border-[var(--color-panel-line-strong)] text-left">
                <th scope="col" className="px-4 py-2.5 font-display text-xs font-bold uppercase tracking-wide text-fg-soft">
                  Success criterion
                </th>
                <th scope="col" className="px-4 py-2.5 font-display text-xs font-bold uppercase tracking-wide text-fg-soft">
                  Level
                </th>
                <th scope="col" className="px-4 py-2.5 font-display text-xs font-bold uppercase tracking-wide text-fg-soft">
                  Status
                </th>
                <th scope="col" className="px-4 py-2.5 font-display text-xs font-bold uppercase tracking-wide text-fg-soft">
                  How we checked
                </th>
              </tr>
            </thead>
            <tbody>
              {criteria.map((c) => (
                <CriterionRow
                  key={c.sc}
                  criterion={c}
                  rules={c.status === "fail" ? rulesBySc.get(c.sc) ?? [] : []}
                  siteId={siteId}
                />
              ))}
              {/* Shown by the client filter only when it would otherwise empty this section. */}
              {failing === 0 ? (
                <tr data-empty-when="failures">
                  <td colSpan={4} className="px-4 py-4 text-sm text-fg-soft">
                    No failing criteria in this principle.
                  </td>
                </tr>
              ) : null}
              {manualCount === 0 ? (
                <tr data-empty-when="manual">
                  <td colSpan={4} className="px-4 py-4 text-sm text-fg-soft">
                    No criteria here require manual review.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/** A single criterion row. Carries data-attributes the client filter keys off. */
function CriterionRow({
  criterion,
  rules,
  siteId,
}: {
  criterion: ChecklistCriterion;
  rules: RuleRollup[];
  siteId: string;
}) {
  const { sc, title, level, coverage, status } = criterion;
  return (
    <tr
      data-conformance-status={status}
      data-conformance-coverage={coverage}
      className="border-b border-[var(--color-panel-line)] align-top last:border-b-0"
    >
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-2">
            <CodeChip>{sc}</CodeChip>
            <span className="font-bold text-fg">{title}</span>
          </span>
          {rules.length > 0 ? (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-soft">
              <span className="font-bold">Open issue{rules.length === 1 ? "" : "s"}:</span>
              {rules.map((r) => (
                <Link
                  key={r.ruleId}
                  href={`/dashboard/issues/${encodeURIComponent(`${siteId}:${r.ruleId}`)}`}
                  className="font-bold text-link no-underline underline-offset-2 hover:underline"
                >
                  {ruleTitle(r.ruleId, r.message)}
                </Link>
              ))}
            </span>
          ) : null}
        </div>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <LevelTag level={level} />
      </td>
      <td className="px-4 py-3">
        <StatusPill status={status} />
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-xs text-fg-soft">
        {COVERAGE_NOTE[coverage]}
      </td>
    </tr>
  );
}
