/**
 * Conformance certificate: a dated, branded summary of a site's automated WCAG results — the
 * artifact procurement teams ask for. Like the statement, it is computed live from the latest scan
 * and is deliberately HONEST: it certifies what automated testing covers (~30–40% of WCAG), never
 * "full compliance". Pure + client-safe so it can be unit tested; the DB wiring and PDF rendering
 * live in lib/server/certificate.ts.
 */

import type { StatementConfig } from "@web-access/shared";
import type { ConformanceChecklist, ConformanceReport } from "./wcag";
import { TARGET_LABELS } from "./statement-template";
import { SITE_NAME } from "./site";

export type CertificateModel = {
  entityName: string;
  siteHost: string | null;
  targetLabel: string;
  /** Did the automated checks find zero failures at Level A / Level AA? */
  aClean: boolean;
  aaClean: boolean;
  /** Has any scan completed at all? A certificate over no data makes no claim. */
  evaluated: boolean;
  /** Headline counts. */
  passed: number;
  failed: number;
  checkedAutomatically: number;
  manualReviewCount: number;
  totalCriteria: number;
  /** Passed / checked-automatically, as a whole-number percentage (0 when nothing was checked). */
  automatedScore: number;
  /** Failing-criteria split, for the level summary. */
  failingA: number;
  failingAA: number;
  totalA: number;
  totalAA: number;
  /** How many distinct pages the certificate covers. */
  pageCount: number;
  generatedAt: string;
  lastScannedAt: string | null;
  producedBy: string;
};

export function buildCertificateModel(input: {
  siteName: string;
  origin: string | null;
  config: StatementConfig;
  conformance: ConformanceReport;
  checklist: ConformanceChecklist;
  pageCount: number;
  generatedAt: Date;
  lastScannedAt: Date | null;
}): CertificateModel {
  const { siteName, origin, config, conformance, checklist } = input;
  const summary = checklist.summary;
  const checkedAutomatically = summary.total - summary.manualTotal;

  let siteHost: string | null = null;
  if (origin) {
    try {
      siteHost = new URL(origin).host;
    } catch {
      siteHost = origin.replace(/^https?:\/\//, "");
    }
  }

  return {
    entityName: config.entityName?.trim() || siteName,
    siteHost,
    targetLabel: TARGET_LABELS[config.target],
    aClean: conformance.aConformant,
    aaClean: conformance.aaConformant,
    evaluated: conformance.evaluated,
    passed: summary.passed,
    failed: summary.failed,
    checkedAutomatically,
    manualReviewCount: summary.manualTotal,
    totalCriteria: summary.total,
    automatedScore: checkedAutomatically > 0 ? Math.round((summary.passed / checkedAutomatically) * 100) : 0,
    failingA: conformance.byLevel.A.failing,
    failingAA: conformance.byLevel.AA.failing,
    totalA: conformance.byLevel.A.total,
    totalAA: conformance.byLevel.AA.total,
    pageCount: input.pageCount,
    generatedAt: input.generatedAt.toISOString(),
    lastScannedAt: input.lastScannedAt ? input.lastScannedAt.toISOString() : null,
    producedBy: SITE_NAME,
  };
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/** A complete, self-contained, print-optimised certificate document (used for both PDF and HTML). */
export function renderCertificateDocument(m: CertificateModel): string {
  const entity = esc(m.entityName);
  const headline = !m.evaluated
    ? "Awaiting first scan"
    : m.aaClean
      ? `Passed all automatically-testable ${esc(m.targetLabel)} criteria`
      : `Passed ${m.passed} of ${m.checkedAutomatically} automatically-testable criteria`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Accessibility conformance certificate — ${entity}</title>
<style>
  @page { size: A4; margin: 18mm; }
  :root { --ink:#16161a; --soft:#5b5b66; --line:#d9d9e0; --brand:#1a55d6; --good:#1f8a4c; --bad:#c0392b; }
  * { box-sizing: border-box; }
  body { font: 15px/1.55 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: var(--ink); max-width: 52rem; margin: 0 auto; padding: 2.5rem 1.5rem; }
  header { display:flex; justify-content:space-between; align-items:baseline; border-bottom:2px solid var(--ink); padding-bottom:.75rem; }
  .brand { font-weight:800; letter-spacing:.02em; }
  .eyebrow { text-transform:uppercase; letter-spacing:.14em; font-size:.7rem; font-weight:700; color:var(--soft); }
  h1 { font-size:1.9rem; line-height:1.15; margin:1.5rem 0 .25rem; }
  .host { color:var(--soft); }
  .headline { margin:1.5rem 0; padding:1rem 1.25rem; border:2px solid var(--line); border-radius:10px; font-size:1.15rem; font-weight:700; }
  .grid { display:grid; grid-template-columns:repeat(3,1fr); gap:.75rem; margin:1.25rem 0; }
  .stat { border:1px solid var(--line); border-radius:10px; padding:.9rem 1rem; }
  .stat .n { font-size:1.6rem; font-weight:800; }
  .stat .l { font-size:.75rem; color:var(--soft); text-transform:uppercase; letter-spacing:.06em; }
  table { width:100%; border-collapse:collapse; margin:1rem 0; }
  th,td { text-align:left; padding:.5rem .25rem; border-bottom:1px solid var(--line); font-size:.95rem; }
  th { font-size:.72rem; text-transform:uppercase; letter-spacing:.06em; color:var(--soft); }
  .ok { color:var(--good); font-weight:700; } .no { color:var(--bad); font-weight:700; }
  .disclaimer { margin-top:1.5rem; padding:1rem 1.25rem; background:#f6f6f9; border-radius:10px; font-size:.85rem; color:var(--soft); }
  footer { margin-top:2rem; border-top:1px solid var(--line); padding-top:.75rem; font-size:.8rem; color:var(--soft); display:flex; justify-content:space-between; }
</style>
</head>
<body>
  <header>
    <span class="brand">${esc(m.producedBy)}</span>
    <span class="eyebrow">Accessibility conformance certificate</span>
  </header>

  <h1>${entity}</h1>
  ${m.siteHost ? `<p class="host">${esc(m.siteHost)}</p>` : ""}

  <div class="headline">${esc(headline)}</div>

  ${
    m.evaluated
      ? `<div class="grid">
    <div class="stat"><div class="n">${m.automatedScore}%</div><div class="l">Automated pass rate</div></div>
    <div class="stat"><div class="n">${m.failed}</div><div class="l">Failing criteria</div></div>
    <div class="stat"><div class="n">${m.pageCount}</div><div class="l">Pages covered</div></div>
  </div>

  <table>
    <thead><tr><th>Level</th><th>Failing</th><th>Status (automated)</th></tr></thead>
    <tbody>
      <tr><td>WCAG ${esc(m.targetLabel.replace(/^WCAG /, "").replace(/ level A+$/, ""))} — Level A</td><td>${m.failingA} of ${m.totalA}</td><td>${m.aClean ? '<span class="ok">No failures detected</span>' : '<span class="no">Failures detected</span>'}</td></tr>
      <tr><td>Level AA</td><td>${m.failingAA} of ${m.totalAA}</td><td>${m.aaClean ? '<span class="ok">No failures detected</span>' : '<span class="no">Failures detected</span>'}</td></tr>
    </tbody>
  </table>`
      : `<p class="host">A certificate will be issued once an accessibility scan has completed for this site.</p>`
  }

  <div class="disclaimer">
    This certificate reflects <strong>automated testing only</strong>. Automated tools reliably evaluate roughly 30–40% of WCAG success criteria; ${m.evaluated ? `${m.checkedAutomatically} of ${m.totalCriteria} criteria were checked automatically and ${m.manualReviewCount} require manual review.` : ""} A clean automated result is strong evidence but is <strong>not a guarantee of full conformance</strong> and does not replace a manual audit by an accessibility specialist.
  </div>

  <footer>
    <span>Issued by ${esc(m.producedBy)}${m.lastScannedAt ? ` · Based on the scan of ${longDate(m.lastScannedAt)}` : ""}</span>
    <span>Generated ${longDate(m.generatedAt)}</span>
  </footer>
</body>
</html>`;
}
