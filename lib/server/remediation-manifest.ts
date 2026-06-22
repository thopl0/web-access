import {
  isSafeCssProperty,
  isSafeRemediationAttr,
  type AttributePatch,
  type CssPatch,
  type RemediationEntry,
  type RemediationManifest,
} from "@web-access/shared";

/**
 * Pure manifest assembly for runtime remediation, split out from `remediation.ts` (which is
 * `server-only`, so it can't be imported in a unit test) so the safe-attr/CSS filtering can be tested
 * directly. No DB, no server imports here.
 */

/** A row shape the builder consumes (subset of the `remediations` table). */
export type RemediationRow = {
  selector: string;
  /** "attr" (safe non-visual attribute) or "css" (experimental CSS property). */
  kind: string;
  attr: string;
  value: string;
  enabled: boolean;
};

/**
 * Group enabled remediation rows into a manifest, keyed by selector. Drops disabled rows, attr rows
 * whose attr is NOT in SAFE_REMEDIATION_ATTRS, and css rows whose property is NOT in
 * SAFE_CSS_PROPERTIES — a belt-and-braces second gate on top of the approval action and the query's
 * WHERE clause. `includeCss` is false unless the site opted into experimental CSS fixes, so CSS
 * patches are never served otherwise even if rows exist.
 */
export function buildManifest(rows: RemediationRow[], includeCss = false): RemediationManifest {
  const attrsBySelector = new Map<string, AttributePatch[]>();
  const cssBySelector = new Map<string, CssPatch[]>();
  for (const row of rows) {
    if (!row.enabled) continue;
    if (row.kind === "css") {
      if (!includeCss) continue; // CSS fixes are opt-in per site
      if (!isSafeCssProperty(row.attr)) continue; // defensive: never serve a non-safe CSS prop
      let css = cssBySelector.get(row.selector);
      if (!css) cssBySelector.set(row.selector, (css = []));
      css.push({ prop: row.attr as CssPatch["prop"], value: row.value });
    } else {
      if (!isSafeRemediationAttr(row.attr)) continue; // defensive: never serve a non-safe attr
      let patches = attrsBySelector.get(row.selector);
      if (!patches) attrsBySelector.set(row.selector, (patches = []));
      patches.push({ attr: row.attr, value: row.value });
    }
  }
  const selectors = new Set([...attrsBySelector.keys(), ...cssBySelector.keys()]);
  const entries: RemediationEntry[] = [...selectors].map((selector) => ({
    selector,
    patches: attrsBySelector.get(selector) ?? [],
    css: cssBySelector.get(selector) ?? [],
  }));
  return { entries };
}
