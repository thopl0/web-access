import {
  isSafeRemediationAttr,
  type AttributePatch,
  type RemediationEntry,
  type RemediationManifest,
} from "@web-access/shared";

/**
 * Pure manifest assembly for Phase C runtime remediation, split out from `remediation.ts` (which is
 * `server-only`, so it can't be imported in a unit test) so the safe-attr filtering can be tested
 * directly. No DB, no server imports here.
 */

/** A row shape the builder consumes (subset of the `remediations` table). */
export type RemediationRow = {
  selector: string;
  attr: string;
  value: string;
  enabled: boolean;
};

/**
 * Group enabled, safe-attr remediation rows into a manifest, keyed by selector. Drops any row whose
 * attr is NOT in SAFE_REMEDIATION_ATTRS and any disabled row — a belt-and-braces second gate on top
 * of the approval action and the query's WHERE clause, so a non-safe attr can never reach the embed
 * even if a row was somehow written directly to the DB.
 */
export function buildManifest(rows: RemediationRow[]): RemediationManifest {
  const bySelector = new Map<string, AttributePatch[]>();
  for (const row of rows) {
    if (!row.enabled) continue;
    if (!isSafeRemediationAttr(row.attr)) continue; // defensive: never serve a non-safe attr
    let patches = bySelector.get(row.selector);
    if (!patches) bySelector.set(row.selector, (patches = []));
    patches.push({ attr: row.attr, value: row.value });
  }
  const entries: RemediationEntry[] = [...bySelector.entries()].map(([selector, patches]) => ({
    selector,
    patches,
  }));
  return { entries };
}
