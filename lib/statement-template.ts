/**
 * Live accessibility statement ("LiveStatement"): a standard, published accessibility statement
 * whose conformance facts are derived from the site's LATEST scan, so it never goes stale. The
 * owner supplies only the parts automation can't know (entity name, contact route) via
 * `StatementConfig`; everything else is computed from the same WCAG engine the dashboard uses.
 *
 * Honesty is load-bearing here (this is a public, quasi-legal document): we never claim "fully
 * conformant" off the back of automated testing — only ~30–40% of WCAG is machine-testable — and
 * we always disclose what was checked automatically vs. what still needs manual review.
 *
 * Pure + client-safe (no IO / server-only deps) so it can be unit tested and rendered anywhere; the
 * DB/report wiring lives in lib/server/statement.ts.
 */

import type { StatementConfig } from "@web-access/shared";
import type { ConformanceChecklist, ConformanceReport, WcagLevel } from "./wcag";
import { SITE_NAME } from "./site";

/** A WCAG criterion the statement reports as failing — the "non-accessible content" section. */
export type StatementFailing = { sc: string; title: string; level: WcagLevel };

export type ConformanceStatus =
  /** No completed scan yet — the statement can't make any claim. */
  | "no-data"
  /** Automated checks found failures — partially conformant, with known limitations listed. */
  | "partial-issues"
  /** Automated checks found no failures — partially conformant pending manual audit. */
  | "partial-clean";

export type StatementModel = {
  /** Display name of the responsible entity (config override, else the site name). */
  entityName: string;
  siteName: string;
  /** Bare host (no scheme) for display, or null if the site has no origin set. */
  siteHost: string | null;
  /** Human label for the target standard, e.g. "WCAG 2.1 level AA". */
  targetLabel: string;
  status: ConformanceStatus;
  /** "Partially conformant" / "Cannot be assessed" — the headline phrase. */
  statusLabel: string;
  /** Distinct A/AA criteria with at least one open issue (worst principle first). */
  failing: StatementFailing[];
  /** Coverage honesty figures, mirroring the conformance page. */
  checkedAutomatically: number;
  manualReviewCount: number;
  totalCriteria: number;
  /** Contact route for accessibility feedback (at least one is always present after fallback). */
  contactEmail: string | null;
  contactUrl: string | null;
  /** ISO date this statement reflects (the report's freshness) + when it was rendered. */
  generatedAt: string;
  lastScannedAt: string | null;
  /** The product that produced it, for the assessment-approach section. */
  producedBy: string;
};

/** Human labels for the supported target standards. Shared with the certificate. */
export const TARGET_LABELS: Record<StatementConfig["target"], string> = {
  "2.1-AA": "WCAG 2.1 level AA",
  "2.2-AA": "WCAG 2.2 level AA",
};

/**
 * Build the statement model from already-computed conformance data. Pure (no IO) so it can be unit
 * tested against fixed inputs — the loader in lib/server/statement.ts wires it to the DB/report.
 */
export function buildStatementModel(input: {
  siteName: string;
  origin: string | null;
  config: StatementConfig;
  conformance: ConformanceReport;
  checklist: ConformanceChecklist;
  ownerEmail?: string | null;
  generatedAt: Date;
  lastScannedAt: Date | null;
}): StatementModel {
  const { siteName, origin, config, conformance, checklist, ownerEmail, generatedAt } = input;

  const failing: StatementFailing[] = conformance.failing.map((f) => ({
    sc: f.sc,
    title: f.title,
    level: f.level,
  }));

  const status: ConformanceStatus = !conformance.evaluated
    ? "no-data"
    : conformance.blockingAA > 0
      ? "partial-issues"
      : "partial-clean";

  const statusLabel = status === "no-data" ? "Cannot yet be assessed" : "Partially conformant";

  const summary = checklist.summary;

  let siteHost: string | null = null;
  if (origin) {
    try {
      siteHost = new URL(origin).host;
    } catch {
      siteHost = origin.replace(/^https?:\/\//, "");
    }
  }

  // Contact fallback: prefer the explicit config, else the owner's account email — a statement
  // with no feedback channel is non-compliant, so we always surface at least one.
  const contactEmail = config.contactEmail ?? ownerEmail ?? null;

  return {
    entityName: config.entityName?.trim() || siteName,
    siteName,
    siteHost,
    targetLabel: TARGET_LABELS[config.target],
    status,
    statusLabel,
    failing,
    checkedAutomatically: summary.total - summary.manualTotal,
    manualReviewCount: summary.manualTotal,
    totalCriteria: summary.total,
    contactEmail,
    contactUrl: config.contactUrl ?? null,
    generatedAt: generatedAt.toISOString(),
    lastScannedAt: input.lastScannedAt ? input.lastScannedAt.toISOString() : null,
    producedBy: SITE_NAME,
  };
}

// ---------------------------------------------------------------------------
// Standalone HTML export — the "copy this onto your own site" deliverable.
//
// Self-contained (inline styles, no external assets, semantic + accessible markup) so an owner can
// paste it into their own page and have it render correctly anywhere. This is what makes us a
// "LiveStatement" alternative even for owners who'd rather host it themselves.
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** The statement body as semantic HTML (no <html> wrapper) — reused by the full document below. */
export function statementBodyHtml(m: StatementModel): string {
  const parts: string[] = [];
  const entity = esc(m.entityName);

  parts.push(`<h1>Accessibility statement for ${entity}</h1>`);
  parts.push(
    `<p>${entity} is committed to making ${m.siteHost ? `<a href="https://${esc(m.siteHost)}">${esc(m.siteHost)}</a>` : "its website"} accessible, in accordance with ${esc(m.targetLabel)}.</p>`,
  );

  parts.push(`<h2>Conformance status</h2>`);
  if (m.status === "no-data") {
    parts.push(
      `<p>This website has not yet been assessed. A conformance status will appear here once an accessibility scan has completed.</p>`,
    );
  } else {
    parts.push(
      `<p>The <a href="https://www.w3.org/WAI/standards-guidelines/wcag/">Web Content Accessibility Guidelines (WCAG)</a> define requirements for designers and developers to improve accessibility for people with disabilities. This website is <strong>partially conformant</strong> with ${esc(m.targetLabel)}. Partially conformant means that some parts of the content do not fully conform to the accessibility standard.</p>`,
    );
    parts.push(
      `<p>Automated testing checked ${m.checkedAutomatically} of ${m.totalCriteria} success criteria; ${m.manualReviewCount} require manual review and have not been independently audited. Automated testing reliably covers only part of WCAG, so the absence of detected issues is not a guarantee of full conformance.</p>`,
    );
  }

  if (m.failing.length > 0) {
    parts.push(`<h2>Non-accessible content</h2>`);
    parts.push(`<p>The following WCAG success criteria are known to be unmet:</p>`);
    parts.push(`<ul>`);
    for (const f of m.failing) {
      parts.push(`<li>${esc(f.sc)} ${esc(f.title)} (Level ${esc(f.level)})</li>`);
    }
    parts.push(`</ul>`);
  } else if (m.status === "partial-clean") {
    parts.push(`<h2>Non-accessible content</h2>`);
    parts.push(
      `<p>Automated testing did not detect any failing success criteria. Criteria that require manual review have not yet been independently audited.</p>`,
    );
  }

  parts.push(`<h2>Feedback</h2>`);
  parts.push(
    `<p>We welcome your feedback on the accessibility of this website. Please let us know if you encounter accessibility barriers:</p>`,
  );
  const contacts: string[] = [];
  if (m.contactEmail) {
    contacts.push(`<li>Email: <a href="mailto:${esc(m.contactEmail)}">${esc(m.contactEmail)}</a></li>`);
  }
  if (m.contactUrl) {
    contacts.push(`<li>Contact page: <a href="${esc(m.contactUrl)}">${esc(m.contactUrl)}</a></li>`);
  }
  if (contacts.length === 0) {
    contacts.push(`<li>Please contact the site owner.</li>`);
  }
  parts.push(`<ul>${contacts.join("")}</ul>`);

  parts.push(`<h2>Assessment approach</h2>`);
  parts.push(
    `<p>${entity} assessed the accessibility of this website by automated testing with ${esc(m.producedBy)}. This statement reflects the most recent scan${m.lastScannedAt ? ` (${longDate(m.lastScannedAt)})` : ""} and is updated automatically as the site is re-scanned.</p>`,
  );
  parts.push(`<p><small>Statement generated on ${longDate(m.generatedAt)}.</small></p>`);

  return parts.join("\n");
}

/** A complete, self-contained HTML document for the download/export route. */
export function renderStatementDocument(m: StatementModel): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Accessibility statement for ${esc(m.entityName)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 16px/1.6 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; max-width: 48rem; margin: 0 auto; padding: 2.5rem 1.25rem; color: #1a1a1a; }
  h1 { font-size: 1.875rem; line-height: 1.2; }
  h2 { font-size: 1.25rem; margin-top: 2rem; }
  a { color: #1a55d6; }
  ul { padding-left: 1.25rem; }
  li { margin: 0.25rem 0; }
  small { color: #666; }
  @media (prefers-color-scheme: dark) {
    body { background: #111; color: #eaeaea; } a { color: #7aa7ff; } small { color: #999; }
  }
</style>
</head>
<body>
${statementBodyHtml(m)}
</body>
</html>`;
}
