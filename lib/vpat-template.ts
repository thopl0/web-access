/**
 * VPAT-lite: a Voluntary Product Accessibility Template in the VPAT 2.x "WCAG Report" style, mapping
 * every WCAG 2.1 A/AA success criterion to a VPAT conformance level. Procurement and government teams
 * ask for a VPAT specifically; this is the same live data as the certificate/statement, shaped into
 * that document's standard tables (Table 1: Level A, Table 2: Level AA).
 *
 * Honesty is load-bearing (this is a quasi-legal compliance doc): we derive levels from AUTOMATED
 * testing only and NEVER mark a manual-only criterion "Supports" off a clean scan — those stay
 * "Not Evaluated". The automated-only disclaimer is always present. Pure + client-safe so it can be
 * unit tested; the DB wiring lives in lib/server/vpat.ts.
 */

import type { StatementConfig } from "@web-access/shared";
import type { ChecklistCriterion, ConformanceChecklist, ConformanceReport, WcagLevel } from "./wcag";
import { TARGET_LABELS } from "./statement-template";
import { SITE_NAME } from "./site";

/** The VPAT conformance levels we emit. We only use a subset honestly derivable from automation. */
export type VpatConformance = "Supports" | "Does Not Support" | "Not Evaluated";

/** One criterion as a VPAT row: the success criterion plus its derived conformance + remarks. */
export type VpatRow = {
  sc: string;
  title: string;
  level: WcagLevel;
  conformance: VpatConformance;
  remarks: string;
};

export type VpatModel = {
  /** Display name of the responsible entity (config override, else the site name). */
  entityName: string;
  siteHost: string | null;
  /** Human label for the target standard, e.g. "WCAG 2.1 level AA". */
  targetLabel: string;
  /** Has any scan completed at all? A VPAT over no data evaluates nothing. */
  evaluated: boolean;
  /** Every criterion as a VPAT row, ordered by principle then number (checklist order). */
  rows: VpatRow[];
  /** Rows split by level, for the standard VPAT tables. */
  levelA: VpatRow[];
  levelAA: VpatRow[];
  generatedAt: string;
  lastScannedAt: string | null;
  producedBy: string;
};

/** Map a checklist criterion's status/coverage to its VPAT conformance level + a remark. */
function toVpatRow(c: ChecklistCriterion, evaluated: boolean): VpatRow {
  let conformance: VpatConformance;
  let remarks: string;
  if (c.status === "pass") {
    conformance = "Supports";
    remarks = "Verified by automated testing.";
  } else if (c.status === "fail") {
    conformance = "Does Not Support";
    remarks = "Automated testing detected failures.";
  } else {
    // not-tested — either manual-only (can't be judged by automation) or no scan data yet.
    conformance = "Not Evaluated";
    remarks = !evaluated ? "Not yet scanned." : "Requires manual review.";
  }
  return { sc: c.sc, title: c.title, level: c.level, conformance, remarks };
}

/**
 * Build the VPAT model from already-computed conformance data. Pure (no IO) so it can be unit tested
 * against fixed inputs — the loader in lib/server/vpat.ts wires it to the DB/report.
 */
export function buildVpatModel(input: {
  siteName: string;
  origin: string | null;
  config: StatementConfig;
  conformance: ConformanceReport;
  checklist: ConformanceChecklist;
  generatedAt: Date;
  lastScannedAt: Date | null;
}): VpatModel {
  const { siteName, origin, config, checklist } = input;
  const evaluated = checklist.evaluated;

  const rows = checklist.criteria.map((c) => toVpatRow(c, evaluated));

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
    evaluated,
    rows,
    levelA: rows.filter((r) => r.level === "A"),
    levelAA: rows.filter((r) => r.level === "AA"),
    generatedAt: input.generatedAt.toISOString(),
    lastScannedAt: input.lastScannedAt ? input.lastScannedAt.toISOString() : null,
    producedBy: SITE_NAME,
  };
}

// ---------------------------------------------------------------------------
// Standalone HTML export — the downloadable VPAT document.
//
// Self-contained (inline styles, no external assets), print-friendly, and built from real semantic
// <table>s in the VPAT 2.x "WCAG Report" layout so it reads as a recognisable VPAT.
// ---------------------------------------------------------------------------

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

/** One VPAT table (a level's criteria) as semantic HTML. */
function tableHtml(caption: string, rows: VpatRow[]): string {
  const body = rows
    .map(
      (r) =>
        `      <tr>
        <td>${esc(r.sc)} ${esc(r.title)} (Level ${esc(r.level)})</td>
        <td>${esc(r.conformance)}</td>
        <td>${esc(r.remarks)}</td>
      </tr>`,
    )
    .join("\n");

  return `  <table>
    <caption>${esc(caption)}</caption>
    <thead>
      <tr><th scope="col">Criteria</th><th scope="col">Conformance Level</th><th scope="col">Remarks and Explanations</th></tr>
    </thead>
    <tbody>
${body}
    </tbody>
  </table>`;
}

/** A complete, self-contained, print-friendly VPAT document for the download/export route. */
export function renderVpatDocument(m: VpatModel): string {
  const entity = esc(m.entityName);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Accessibility Conformance Report (VPAT) — ${entity}</title>
<style>
  @page { size: A4; margin: 18mm; }
  :root { --ink:#16161a; --soft:#5b5b66; --line:#d9d9e0; --brand:#1a55d6; }
  * { box-sizing: border-box; }
  body { font: 14px/1.55 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: var(--ink); max-width: 60rem; margin: 0 auto; padding: 2.5rem 1.5rem; }
  header { display:flex; justify-content:space-between; align-items:baseline; border-bottom:2px solid var(--ink); padding-bottom:.75rem; }
  .brand { font-weight:800; letter-spacing:.02em; }
  .eyebrow { text-transform:uppercase; letter-spacing:.14em; font-size:.7rem; font-weight:700; color:var(--soft); }
  h1 { font-size:1.7rem; line-height:1.15; margin:1.5rem 0 .25rem; }
  h2 { font-size:1.2rem; margin:2rem 0 .25rem; }
  .host { color:var(--soft); }
  dl.meta { display:grid; grid-template-columns:max-content 1fr; gap:.25rem 1rem; margin:1rem 0; }
  dl.meta dt { font-weight:700; color:var(--soft); }
  dl.meta dd { margin:0; }
  table { width:100%; border-collapse:collapse; margin:.75rem 0 1.5rem; }
  caption { text-align:left; font-weight:700; margin-bottom:.4rem; }
  th,td { text-align:left; padding:.5rem .6rem; border:1px solid var(--line); font-size:.9rem; vertical-align:top; }
  th { background:#f6f6f9; font-size:.72rem; text-transform:uppercase; letter-spacing:.06em; color:var(--soft); }
  .disclaimer { margin:1.5rem 0; padding:1rem 1.25rem; background:#f6f6f9; border-left:4px solid var(--brand); border-radius:6px; font-size:.85rem; color:var(--ink); }
  footer { margin-top:2rem; border-top:1px solid var(--line); padding-top:.75rem; font-size:.8rem; color:var(--soft); display:flex; justify-content:space-between; }
</style>
</head>
<body>
  <header>
    <span class="brand">${esc(m.producedBy)}</span>
    <span class="eyebrow">Accessibility Conformance Report (VPAT)</span>
  </header>

  <h1>${entity}</h1>
  ${m.siteHost ? `<p class="host">${esc(m.siteHost)}</p>` : ""}

  <dl class="meta">
    <dt>Name of product</dt><dd>${m.siteHost ? esc(m.siteHost) : entity}</dd>
    <dt>Report date</dt><dd>${longDate(m.generatedAt)}</dd>
    <dt>Evaluation methods</dt><dd>Automated testing with ${esc(m.producedBy)}${m.lastScannedAt ? ` (latest scan ${longDate(m.lastScannedAt)})` : ""}</dd>
    <dt>Applicable standard</dt><dd>${esc(m.targetLabel)}</dd>
  </dl>

  <div class="disclaimer">
    <strong>Automated testing only.</strong> The conformance levels below are derived solely from automated accessibility testing, which reliably evaluates roughly 30–40% of WCAG success criteria. Criteria that require human judgement are reported as <strong>&ldquo;Not Evaluated&rdquo;</strong> rather than &ldquo;Supports&rdquo;. A &ldquo;Supports&rdquo; result reflects only what automated checks can verify and is <strong>not a guarantee of full conformance</strong>; it does not replace a manual audit by an accessibility specialist.${m.evaluated ? "" : " No scan has completed for this product yet, so every criterion is reported as &ldquo;Not Evaluated&rdquo;."}
  </div>

  <h2>Table 1: Success Criteria, Level A</h2>
${tableHtml("WCAG 2.1 Level A", m.levelA)}

  <h2>Table 2: Success Criteria, Level AA</h2>
${tableHtml("WCAG 2.1 Level AA", m.levelAA)}

  <footer>
    <span>Produced by ${esc(m.producedBy)}${m.lastScannedAt ? ` · Based on the scan of ${longDate(m.lastScannedAt)}` : ""}</span>
    <span>Generated ${longDate(m.generatedAt)}</span>
  </footer>
</body>
</html>`;
}
