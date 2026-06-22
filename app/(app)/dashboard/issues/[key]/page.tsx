import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Inbox, Sparkles, Zap } from "lucide-react";

import { BackLink, EmptyState, PageHeader, Panel } from "@/components/dashboard/ui";
import { PageShell, Section } from "@/components/dashboard/layout";
import { Badge } from "@/components/ui/Badge";
import { SeverityBadge } from "@/components/dashboard/severity";
import { IssueActions } from "@/components/dashboard/IssueActions";
import { CopyButton } from "@/components/dashboard/CopyButton";
import { ruleTitle } from "@/components/dashboard/IssueDetail";
import { AnnotatedShot } from "@/components/dashboard/AnnotatedShot";
import { ApplyAllFixes, FixBlock, IssueSpots, type SpotElement, type SpotPage, type SpotPattern } from "@/components/dashboard/IssueSpots";
import { eq } from "drizzle-orm";

import { verifySession } from "@/lib/server/dal";
import { db, schema } from "@/lib/server/db";
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
    ...(el.fix ? { fix: el.fix } : {}),
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

/** Validate an optional `?from=<siteId>` so a malformed param can never bend the Back link off-site. */
function parseFrom(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  // Site ids are short opaque tokens; accept only plausible ones and never anything path-shaped.
  return /^[A-Za-z0-9_-]{1,64}$/.test(raw) ? raw : null;
}

export default async function IssueDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { key: rawKey } = await params;
  const { from } = await searchParams;
  const { userId } = await verifySession();

  // This Next build does NOT URL-decode dynamic route params, so the ':' in our "siteId:ruleId" key
  // arrives as %3A — we must decode before getIssueDetail splits on ':'. The try/catch guards a
  // malformed escape; for our keys (no literal '%') decoding an already-decoded value is a no-op.
  let key = rawKey;
  try {
    key = decodeURIComponent(rawKey);
  } catch {
    key = rawKey;
  }
  const issue = await getIssueDetail(userId, key);

  // A validly-linked issue can disappear between the list rendering and the click: a re-scan may have
  // dropped the rule (often because it was just fixed) or the page changed, so it's no longer in the
  // current rollup. Rather than a jarring hard 404, return a calm note with a route back to the list.
  // `from` (when present + valid) sends them to the per-site issues list they came from.
  const fromSite = parseFrom(from);
  if (!issue) {
    const missingBackHref = fromSite ? `/dashboard/${fromSite}/issues` : "/dashboard/issues";
    return (
      <PageShell>
        <BackLink href={missingBackHref}>Back to issues</BackLink>
        <EmptyState
          className="mt-8"
          icon={<Inbox className="size-6" aria-hidden strokeWidth={2.25} />}
          title="This issue is no longer here"
          action={
            <Link
              href={missingBackHref}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue/50 bg-blue/5 px-3 py-1.5 text-sm font-bold text-blue no-underline transition-colors hover:bg-blue/10"
            >
              View current issues
            </Link>
          }
        >
          It may have been resolved, or the page changed since you opened this. Head back to your
          issues to see what&apos;s open now.
        </EmptyState>
      </PageShell>
    );
  }

  const ex = explainRule(issue.ruleId);

  // Whether this site has runtime remediation turned on — gates the "apply live" control.
  const siteRow = (
    await db
      .select({ rr: schema.sites.runtimeRemediation })
      .from(schema.sites)
      .where(eq(schema.sites.id, issue.siteId))
      .limit(1)
  )[0];
  const runtimeEnabled = Boolean(siteRow?.rr);

  // Back link: when arriving from a per-site issues list (and the id matches this issue's site),
  // return there; otherwise fall back to the global inbox.
  const backToSite = fromSite && fromSite === issue.siteId;
  const backHref = backToSite ? `/dashboard/${issue.siteId}/issues` : "/dashboard/issues";
  const backLabel = backToSite ? `Back to ${issue.siteName} issues` : "Back to issues";

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
    // Flow the concrete before→after change into the prompt when we have one.
    ...(i.el.fix ? { fix: i.el.fix } : {}),
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
  // Prefer a spot whose fix can be applied live, so the top "The fix" panel surfaces the
  // "Apply as live fix" control whenever the issue has one (otherwise an applyable spot can hide
  // deep in the list). Among applyable spots — or all spots when none is — pick the richest evidence.
  const applyable = instances.filter(
    (i) => i.el.fix?.attributePatch && i.el.fix.attributePatch.length > 0,
  );
  const hero = applyable.length
    ? bestOf(applyable)
    : instances.length
      ? bestOf(instances)
      : null;
  const heroSpot = hero ? toSpotElement(hero.el, hero.shot) : null;

  // Every distinct safe patch that can be applied live right now (one per selector+attr, skipping
  // placeholder values that still need a human). This is the payload for the one-click "apply to all".
  const isPlaceholderValue = (v: string) => /^\s*todo\b/i.test(v);
  const applyablePatches: { selector: string; attr: string; value: string }[] = [];
  const seenPatch = new Set<string>();
  for (const i of instances) {
    for (const p of i.el.fix?.attributePatch ?? []) {
      if (isPlaceholderValue(p.value)) continue;
      const k = `${i.el.selector}\n${p.attr}`;
      if (seenPatch.has(k)) continue;
      seenPatch.add(k);
      applyablePatches.push({ selector: i.el.selector, attr: p.attr, value: p.value });
    }
  }

  // Meta strip facts.
  const effort = effortOf(issue.ruleId);
  const wcagChips = issue.wcag
    .map((sc) => ({ sc, info: WCAG[sc] }))
    .filter((w): w is { sc: string; info: NonNullable<(typeof WCAG)[string]> } => Boolean(w.info));

  return (
    <PageShell>
      <BackLink href={backHref}>{backLabel}</BackLink>

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
            {/* Jump straight to the live-fix control — it sits below the fold in "The fix" panel, so
                surface a header CTA whenever this issue actually has an applyable patch. */}
            {applyable.length > 0 ? (
              <a
                href="#apply-live-fix"
                className="inline-flex items-center gap-1.5 rounded-lg border border-green/50 bg-green/5 px-3 py-1.5 text-sm font-bold text-green no-underline transition-colors hover:bg-green/10"
              >
                <Zap className="size-4" aria-hidden strokeWidth={2.5} />
                Apply live fix
              </a>
            ) : null}
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

              {/* Primary action above the fold: the concrete fix + apply control for the lead spot,
                  reusing the same FixBlock the per-spot cards render below. The id is the scroll
                  target for the header's "Apply live fix" jump; scroll-mt clears the sticky header. */}
              {heroSpot?.fix ? (
                <div id="apply-live-fix" className="scroll-mt-28">
                  <FixBlock
                    fix={heroSpot.fix}
                    selector={heroSpot.selector}
                    siteId={issue.siteId}
                    ruleId={issue.ruleId}
                    runtimeEnabled={runtimeEnabled}
                  />
                  {/* Bulk path: apply the same kind of fix to every other matching spot in one click. */}
                  {applyablePatches.length > 1 ? (
                    <div className="mt-3">
                      <ApplyAllFixes
                        siteId={issue.siteId}
                        ruleId={issue.ruleId}
                        patches={applyablePatches}
                        runtimeEnabled={runtimeEnabled}
                      />
                    </div>
                  ) : null}
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
          <IssueSpots
            patterns={patterns}
            pages={pages}
            totalSpots={totalSpots}
            siteId={issue.siteId}
            ruleId={issue.ruleId}
            runtimeEnabled={runtimeEnabled}
          />
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
