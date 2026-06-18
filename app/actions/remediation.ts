"use server";

import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { isSafeRemediationAttr } from "@web-access/shared";
import { db, schema } from "@/lib/server/db";
import { verifySession } from "@/lib/server/dal";
import { getUserEntitlements } from "@/lib/server/entitlements";

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

/**
 * Approve (or re-approve) one safe attribute patch for live application. Upserts by
 * (siteId, selector, attr) so editing an approved value updates in place. Enforces the safe-attr
 * allowlist and rejects empty / placeholder values — for `alt`, an empty value is legitimate
 * (decorative image), so the empty-value check is skipped there.
 */
export async function approveRemediation(
  siteId: string,
  input: { selector: string; attr: string; value: string },
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

  revalidatePath(`/dashboard/${siteId}/settings`);
  return { ok: true };
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
