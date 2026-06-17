import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Sparkles } from "lucide-react";

import { BackLink, PageHeader, Panel } from "@/components/dashboard/ui";
import { PageShell, Section } from "@/components/dashboard/layout";
import { Badge } from "@/components/ui/Badge";
import { SeverityBadge } from "@/components/dashboard/severity";
import { IssueActions } from "@/components/dashboard/IssueActions";
import { CopyButton } from "@/components/dashboard/CopyButton";
import { ruleTitle } from "@/components/dashboard/IssueDetail";
import { AnnotatedShot } from "@/components/dashboard/AnnotatedShot";
import { IssueSpots, type SpotElement, type SpotPage, type SpotPattern } from "@/components/dashboard/IssueSpots";
import { verifySession } from "@/lib/server/dal";
import { getIssueDetail } from "@/lib/server/issues";
import type { IssueElement, PageShot, RulePage } from "@/lib/server/report";
import { buildAiFixPrompt } from "@/lib/aiFixPrompt";
import { explainRule } from "@/lib/explain";
import { effortOf, EFFORT_LABEL } from "@/lib/effort";
import { WCAG } from "@/lib/wcag";
import type { Severity } from "@/lib/severity";

export const metadata: Metadata = { title: "Issue" };
export const dynamic = "force-dynamic";

/** A flattened element instance carrying its page's path + full-page shot. */
type Instance = { path: string; el: IssueElement; shot?: PageShot | undefined };

/** Pull only the serializable bits an element needs for the client/evidence UI. */
function toSpotElement(el: IssueElement, shot?: PageShot | undefined): SpotElement {
  return {
    selector: el.selector,
    htmlSnippet: el.htmlSnippet,
    ...(el.screenshot ? { crop: el.screenshot } : {}),
    ...(el.width !== undefined ? { cropWidth: el.width } : {}),
    ...(el.height !== undefined ? { cropHeight: el.height } : {}),
    ...(el.box ? { box: el.box } : {}),
    ...(shot ? { shot } : {}),
    ...(el.explanation ? { explanation: el.explanation } : {}),
    ...(el.urls ? { urls: el.urls } : {}),
  };
}

/** Best evidence available on an instance, for ranking canonical examples. */
function evidenceRank(inst: Instance): number {
  if (inst.shot && inst.el.box) return 2; // full-page shot + highlight box
  if (inst.el.screenshot) return 1; // element crop
  return 0; // text only
}

/** Pick the richest instance from a list (prefer shot+box, then crop). */
function bestOf(instances: Instance[]): Instance {
  return instances.reduce((best, cur) => (evidenceRank(cur) > evidenceRank(best) ? cur : best));
}

function pathOfUrl(u: string): string {
  try {
    return new URL(u).pathname || "/";
  } catch {
    return u;
  }
}

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const { userId } = await verifySession();

  const issue = await getIssueDetail(userId, decodeURIComponent(key));
  if (!issue) notFound();

  const ex = explainRule(issue.ruleId);

  // Flatten every offending element across pages, carrying its page's shot.
  const instances: Instance[] = issue.pages.flatMap((p: RulePage) =>
    p.elements.map((el) => ({ path: p.path, el, shot: p.shot })),
  );
  const totalSpots = instances.length;

  // AI-builder prompt (unchanged contract): every affected element.
  const occurrences = instances.map((i) => ({
    path: i.path,
    selector: i.el.selector,
    snippet: i.el.htmlSnippet,
  }));
  const aiPrompt = buildAiFixPrompt({
    ruleId: issue.ruleId,
    message: issue.message,
    wcag: issue.wcag,
    ...(ex ? { what: ex.what, fix: ex.fix } : {}),
    occurrences,
  });

  // --- Smart grouping: collapse identical (selector + markup) into patterns. ---
  const bySignature = new Map<string, Instance[]>();
  for (const inst of instances) {
    const sig = `${inst.el.selector}\n${inst.el.htmlSnippet}`;
    const list = bySignature.get(sig);
    if (list) list.push(inst);
    else bySignature.set(sig, [inst]);
  }

  const patterns: SpotPattern[] = [...bySignature.values()]
    .map((group, i) => {
      const canonical = bestOf(group);
      // Count concrete spots, accounting for collapsed dynamic-route families.
      const count = group.reduce((n, g) => n + (g.el.urls?.length ?? 1), 0);
      // Distinct page paths this pattern touches.
      const paths = new Set<string>();
      const extraPages = 0;
      for (const g of group) {
        if (g.el.urls && g.el.urls.length) {
          for (const u of g.el.urls) paths.add(pathOfUrl(u));
        } else {
          paths.add(g.path);
        }
      }
      return {
        id: `pattern-${i}`,
        count,
        pagePaths: [...paths],
        extraPages,
        example: toSpotElement(canonical.el, canonical.shot),
      } satisfies SpotPattern;
    })
    // Most-recurring patterns first — the highest-leverage "fix once" wins.
    .sort((a, b) => b.count - a.count);

  // --- By-page view: keep the canonical example per page, with its shot. ---
  const pages: SpotPage[] = issue.pages.map((p, i) => ({
    id: `page-${i}`,
    path: p.path,
    grouped: p.grouped,
    pageCount: p.pageCount,
    elements: p.elements.map((el) => toSpotElement(el, p.shot)),
  }));

  // --- Canonical example, pinned at the top (the single best across the issue). ---
  const hero = instances.length ? bestOf(instances) : null;
  const heroSpot = hero ? toSpotElement(hero.el, hero.shot) : null;

  // Meta strip facts.
  const effort = effortOf(issue.ruleId);
  const wcagChips = issue.wcag
    .map((sc) => ({ sc, info: WCAG[sc] }))
    .filter((w): w is { sc: string; info: NonNullable<(typeof WCAG)[string]> } => Boolean(w.info));

  return (
    <PageShell>
      <BackLink href="/dashboard/issues">Back to issues</BackLink>

      <PageHeader
        className="mt-4"
        titleId="issue-title"
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <SeverityBadge severity={issue.impact as Severity | null} />
            {issue.reopened ? (
              <span className="rounded-full bg-pink/15 px-2 py-0.5 text-xs font-bold text-pink">
                Reopened
              </span>
            ) : null}
          </span>
        }
        title={ruleTitle(issue.ruleId, issue.message)}
        lead={
          <Link
            href={`/dashboard/${issue.siteId}`}
            className="inline-flex items-center gap-1 font-bold text-link no-underline hover:underline"
          >
            {issue.siteName}
            <ExternalLink className="size-3.5" aria-hidden strokeWidth={2.5} />
          </Link>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <IssueActions issueKey={issue.key} status={issue.status} />
            <CopyButton
              text={aiPrompt}
              label="Copy fix for AI builder"
              copiedLabel="Prompt copied"
              className="!border-blue/50 text-blue"
            />
          </div>
        }
      />

      {/* Inline facts — quiet, no boxes. */}
      <p className="mt-4 text-sm text-fg-soft">
        <span className="font-bold text-fg">
          {totalSpots} {totalSpots === 1 ? "spot" : "spots"}
        </span>{" "}
        across {pages.length} {pages.length === 1 ? "page" : "pages"}
        {wcagChips.map((w) => (
          <span key={w.sc}> · WCAG {w.sc} ({w.info.level})</span>
        ))}
        {" · "}
        {EFFORT_LABEL[effort]} to fix
      </p>

      {/* The fix — one focal block: see it, then how to resolve it. */}
      <Section title="The fix" className="mt-8">
        <Panel>
          <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
            <div className="min-w-0">
              <AnnotatedShot
                shot={heroSpot?.shot}
                box={heroSpot?.box}
                crop={heroSpot?.crop}
                cropWidth={heroSpot?.cropWidth}
                cropHeight={heroSpot?.cropHeight}
                label={heroSpot ? `Screenshot of the affected element: ${heroSpot.selector}` : "No preview captured"}
              />
              {hero ? (
                <p className="mt-2 text-xs text-fg-soft">
                  Example — on <span className="font-bold text-fg">{hero.path}</span>
                  {totalSpots > 1 ? <>, then resolve it the same way everywhere it recurs.</> : null}
                </p>
              ) : null}
            </div>

            <div className="min-w-0">
              {ex ? (
                <>
                  <p className="text-xs font-bold uppercase tracking-wide text-fg-soft">What&apos;s wrong</p>
                  <p className="mt-1 text-fg">{ex.what}</p>
                  <p className="mt-4 text-xs font-bold uppercase tracking-wide text-fg-soft">How to fix it</p>
                  <p className="mt-1 text-fg">{ex.fix}</p>
                </>
              ) : (
                <p className="text-fg">{issue.message}</p>
              )}

              {heroSpot?.explanation ? (
                <div className="mt-4 rounded-lg border border-blue/30 bg-blue/5 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-blue">
                    <Sparkles className="size-3.5" aria-hidden strokeWidth={2.5} />
                    AI suggestion for this spot
                  </p>
                  {heroSpot.explanation.title ? (
                    <p className="mt-1.5 font-bold text-fg">{heroSpot.explanation.title}</p>
                  ) : null}
                  <p className="mt-1 text-sm text-fg">{heroSpot.explanation.what}</p>
                  <p className="mt-1 text-sm text-fg">
                    <span className="font-bold">Fix: </span>
                    {heroSpot.explanation.fix}
                  </p>
                </div>
              ) : null}

              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[var(--color-panel-line)] pt-4">
                {issue.wcag.map((w) => (
                  <Badge key={w} tone="surface">
                    WCAG {w}
                  </Badge>
                ))}
                {issue.helpUrl ? (
                  <a
                    href={issue.helpUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto text-sm font-bold text-link underline underline-offset-2"
                  >
                    Learn more →
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </Panel>
      </Section>

      {/* All spots, grouped and navigable (own heading + controls). */}
      <div className="mt-10">
        {totalSpots > 0 ? (
          <IssueSpots patterns={patterns} pages={pages} totalSpots={totalSpots} />
        ) : (
          <Panel>
            <p className="text-sm text-fg-soft">
              No specific elements were captured for this issue. Re-scan the site to collect evidence.
            </p>
          </Panel>
        )}
      </div>
    </PageShell>
  );
}
