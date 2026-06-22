"use server";

import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { isSafeRemediationAttr } from "@web-access/shared";
import { db, schema } from "@/lib/server/db";
import { verifySession } from "@/lib/server/dal";
import { getUserEntitlements } from "@/lib/server/entitlements";
import { computeIssueFingerprint, getIssueDetail } from "@/lib/server/issues";

/**
 * Phase C runtime remediation — owner-facing actions. Honesty + safety are load-bearing here:
 *   - Every action is ownership-checked (the caller must own the site).
 *   - `approveRemediation` rejects any attr outside SAFE_REMEDIATION_ATTRS and rejects empty /
 *     placeholder ("TODO:") values, so a deterministic placeholder fix can never be approved with its
 *     stand-in text — the owner must type a real value first.
 *   - The master toggle (`setRuntimeRemediation`) gates whether ANY approved patch is ever served
 *     (enforced again in the manifest builder).
 */

/** Load a site the caller owns, or null. Mirrors the helper in app/actions/sites.ts. */
async function ownedSite(siteId: string, userId: string) {
  const rows = await db
    .select()
    .from(schema.sites)
    .where(and(eq(schema.sites.id, siteId), eq(schema.sites.ownerId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Load a remediation row the caller owns (joined through its site), or null. */
async function ownedRemediation(id: number, userId: string) {
  const rows = await db
    .select({ rem: schema.remediations, ownerId: schema.sites.ownerId })
    .from(schema.remediations)
    .innerJoin(schema.sites, eq(schema.remediations.siteId, schema.sites.id))
    .where(eq(schema.remediations.id, id))
    .limit(1);
  const row = rows[0];
  if (!row || row.ownerId !== userId) return null;
  return row.rem;
}

export type RemediationActionResult = { ok: boolean; error?: string };

/** Is this a leftover deterministic placeholder rather than a real owner-authored value? */
function isPlaceholder(value: string): boolean {
  return /^\s*todo\b/i.test(value) || value.trim().toLowerCase().startsWith("todo:");
}

/** A single attribute patch the owner is applying (one spot's safe-attr fix). */
export type PatchInput = { selector: string; attr: string; value: string };

/** Validate one patch against the safe-attr allowlist + value rules. Returns the cleaned patch or null. */
function cleanPatch(input: PatchInput): { selector: string; attr: string; value: string } | null {
  const selector = input.selector.trim();
  const attr = input.attr.trim();
  const value = input.value;
  if (!selector) return null;
  if (!isSafeRemediationAttr(attr)) return null;
  if (isPlaceholder(value)) return null;
  // alt="" is a valid decorative-image fix; every other attr needs a non-empty value.
  if (attr !== "alt" && value.trim() === "") return null;
  return { selector, attr, value };
}

/**
 * After patches land, decide whether the whole ISSUE is now covered by live fixes and, if so, mark it
 * "fixed" so it drops out of the open inbox (this is the link the dashboard was missing — applying a
 * fix used to leave the issue stuck "open"). "Fully covered" is honest: EVERY spot must carry a safe,
 * non-placeholder attribute patch AND each of those patches must be an enabled remediation. An issue
 * with even one spot that has no machine-applicable fix stays open (it still needs a source change).
 * Returns true iff it marked the issue fixed.
 */
async function markIssueFixedIfFullyCovered(
  userId: string,
  siteId: string,
  ruleId: string,
): Promise<boolean> {
  const key = `${siteId}:${ruleId}`;
  const detail = await getIssueDetail(userId, key);
  if (!detail) return false;

  // Currently-enabled remediations for this site, keyed by `selector\nattr`.
  const enabledRows = await db
    .select({ selector: schema.remediations.selector, attr: schema.remediations.attr })
    .from(schema.remediations)
    .where(and(eq(schema.remediations.siteId, siteId), eq(schema.remediations.enabled, true)));
  const enabled = new Set(enabledRows.map((r) => `${r.selector}\n${r.attr}`));

  for (const page of detail.pages) {
    for (const el of page.elements) {
      const patches = el.fix?.attributePatch;
      // No safe attribute patch for this spot → can't be auto-fixed → issue isn't fully fixed.
      if (!patches || patches.length === 0) return false;
      for (const p of patches) {
        if (isPlaceholder(p.value)) return false; // owner still has to supply a real value
        if (!enabled.has(`${el.selector}\n${p.attr}`)) return false; // not applied yet
      }
    }
  }

  const fingerprint = await computeIssueFingerprint(userId, key);
  await db
    .insert(schema.issueOverrides)
    .values({ siteId, issueKey: key, status: "fixed", fingerprint, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.issueOverrides.siteId, schema.issueOverrides.issueKey],
      set: { status: "fixed", fingerprint, updatedAt: new Date() },
    });
  return true;
}

/** Revalidate every surface an applied fix can change (settings list, the issue, its inbox + site). */
function revalidateAfterApply(siteId: string, ruleId?: string): void {
  revalidatePath(`/dashboard/${siteId}/settings`);
  revalidatePath("/dashboard/issues");
  revalidatePath(`/dashboard/${siteId}`);
  revalidatePath(`/dashboard/${siteId}/issues`);
  if (ruleId) revalidatePath(`/dashboard/issues/${encodeURIComponent(`${siteId}:${ruleId}`)}`);
}

/**
 * Approve (or re-approve) one safe attribute patch for live application. Upserts by
 * (siteId, selector, attr) so editing an approved value updates in place. Enforces the safe-attr
 * allowlist and rejects empty / placeholder values — for `alt`, an empty value is legitimate
 * (decorative image), so the empty-value check is skipped there.
 */
export async function approveRemediation(
  siteId: string,
  input: { selector: string; attr: string; value: string },
  /** When known (from the issue detail), lets us auto-mark the issue "fixed" once fully covered. */
  ruleId?: string,
): Promise<RemediationActionResult> {
  const { userId } = await verifySession();
  const site = await ownedSite(siteId, userId);
  if (!site) return { ok: false, error: "Site not found." };

  // Runtime remediation is a paid-plan feature.
  if (!(await getUserEntitlements(userId)).runtimeRemediation) {
    return { ok: false, error: "Upgrade to Pro to apply live fixes." };
  }

  const selector = input.selector.trim();
  const attr = input.attr.trim();
  const value = input.value;

  if (!selector) return { ok: false, error: "Missing a CSS selector for the fix." };
  if (!isSafeRemediationAttr(attr)) {
    return { ok: false, error: `"${attr}" can't be applied as a live fix — it's not a safe, non-visual attribute.` };
  }
  if (isPlaceholder(value)) {
    return { ok: false, error: "Replace the placeholder text with a real value before applying it live." };
  }
  // alt="" is a valid decorative-image fix; every other attr needs a non-empty value.
  if (attr !== "alt" && value.trim() === "") {
    return { ok: false, error: "Enter a value before applying this fix live." };
  }

  await db
    .insert(schema.remediations)
    .values({ siteId, selector, attr, value, enabled: true })
    .onConflictDoUpdate({
      target: [schema.remediations.siteId, schema.remediations.selector, schema.remediations.attr],
      set: { value, enabled: true },
    });

  if (ruleId) await markIssueFixedIfFullyCovered(userId, siteId, ruleId);
  revalidateAfterApply(siteId, ruleId);
  return { ok: true };
}

/**
 * Apply a whole issue's worth of fixes at once. Each spot carries its own (AI-generated, per-element)
 * value, so this is the "fix all similar spots in one click" path — it upserts every valid patch and
 * skips any that still need a human value (placeholders). When the issue ends up fully covered it's
 * marked "fixed" and leaves the open inbox. Ownership- and plan-gated like single approval.
 */
export async function applyFixesToIssue(
  siteId: string,
  ruleId: string,
  patches: PatchInput[],
): Promise<RemediationActionResult & { applied?: number; skipped?: number; fixed?: boolean }> {
  const { userId } = await verifySession();
  const site = await ownedSite(siteId, userId);
  if (!site) return { ok: false, error: "Site not found." };

  if (!(await getUserEntitlements(userId)).runtimeRemediation) {
    return { ok: false, error: "Upgrade to Pro to apply live fixes." };
  }

  // First live fix on a site with the master toggle off → turn it on so this stays one click.
  if (!site.runtimeRemediation) {
    await db.update(schema.sites).set({ runtimeRemediation: true }).where(eq(schema.sites.id, siteId));
  }

  let applied = 0;
  let skipped = 0;
  for (const raw of patches) {
    const clean = cleanPatch(raw);
    if (!clean) {
      skipped++;
      continue;
    }
    await db
      .insert(schema.remediations)
      .values({ siteId, selector: clean.selector, attr: clean.attr, value: clean.value, enabled: true })
      .onConflictDoUpdate({
        target: [schema.remediations.siteId, schema.remediations.selector, schema.remediations.attr],
        set: { value: clean.value, enabled: true },
      });
    applied++;
  }

  if (applied === 0) {
    return { ok: false, error: "Nothing to apply — these spots need a value or a source change.", applied, skipped };
  }

  const fixed = await markIssueFixedIfFullyCovered(userId, siteId, ruleId);
  revalidateAfterApply(siteId, ruleId);
  return { ok: true, applied, skipped, fixed };
}

/** Enable/disable one approved remediation without deleting it (a quick pause). Ownership-checked. */
export async function setRemediationEnabled(
  id: number,
  enabled: boolean,
): Promise<RemediationActionResult> {
  const { userId } = await verifySession();
  const rem = await ownedRemediation(id, userId);
  if (!rem) return { ok: false, error: "Fix not found." };

  await db.update(schema.remediations).set({ enabled }).where(eq(schema.remediations.id, id));
  revalidatePath(`/dashboard/${rem.siteId}/settings`);
  return { ok: true };
}

/** Permanently remove an approved remediation. Ownership-checked. */
export async function removeRemediation(id: number): Promise<RemediationActionResult> {
  const { userId } = await verifySession();
  const rem = await ownedRemediation(id, userId);
  if (!rem) return { ok: false, error: "Fix not found." };

  await db.delete(schema.remediations).where(eq(schema.remediations.id, id));
  revalidatePath(`/dashboard/${rem.siteId}/settings`);
  return { ok: true };
}

/** Master opt-in: turn runtime remediation on/off for the whole site. When off, the manifest is
 *  empty regardless of approved rows, so the embed applies nothing. */
export async function setRuntimeRemediation(
  siteId: string,
  enabled: boolean,
): Promise<RemediationActionResult> {
  const { userId } = await verifySession();
  const site = await ownedSite(siteId, userId);
  if (!site) return { ok: false, error: "Site not found." };

  // Gate turning it ON by plan; always allow turning it OFF (e.g. after a downgrade).
  if (enabled && !(await getUserEntitlements(userId)).runtimeRemediation) {
    return { ok: false, error: "Upgrade to Pro to enable runtime fixes." };
  }

  await db
    .update(schema.sites)
    .set({ runtimeRemediation: enabled })
    .where(eq(schema.sites.id, siteId));
  revalidatePath(`/dashboard/${siteId}/settings`);
  return { ok: true };
}

/** One approved remediation, for the settings list. */
export type ApprovedRemediation = {
  id: number;
  selector: string;
  attr: string;
  value: string;
  enabled: boolean;
};

/** List a site's approved remediations (for the settings UI). Ownership-checked. */
export async function listRemediations(siteId: string): Promise<ApprovedRemediation[]> {
  const { userId } = await verifySession();
  const site = await ownedSite(siteId, userId);
  if (!site) return [];

  const rows = await db
    .select({
      id: schema.remediations.id,
      selector: schema.remediations.selector,
      attr: schema.remediations.attr,
      value: schema.remediations.value,
      enabled: schema.remediations.enabled,
    })
    .from(schema.remediations)
    .where(eq(schema.remediations.siteId, siteId))
    .orderBy(asc(schema.remediations.selector), asc(schema.remediations.attr));
  return rows;
}
