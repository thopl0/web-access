"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { IssueStatus } from "@web-access/shared";
import { db, schema } from "@/lib/server/db";
import { verifySession } from "@/lib/server/dal";
import { computeIssueFingerprint } from "@/lib/server/issues";

export type IssueStatusResult = { ok: boolean; status?: string; message?: string };

/**
 * Set an issue's lifecycle status. Muting (resolved/ignored/snoozed) snapshots the current
 * occurrence fingerprint so the issue auto-reopens if it later changes; "open" clears the override
 * entirely (back to the default). Ownership is enforced via the site embedded in the issue key.
 */
export async function setIssueStatus(key: string, status: string): Promise<IssueStatusResult> {
  const { userId } = await verifySession();

  const sep = key.indexOf(":");
  if (sep < 0) return { ok: false, message: "Bad issue key." };
  const siteId = key.slice(0, sep);

  const owned = await db
    .select({ id: schema.sites.id })
    .from(schema.sites)
    .where(and(eq(schema.sites.id, siteId), eq(schema.sites.ownerId, userId)))
    .limit(1);
  if (!owned[0]) return { ok: false, message: "Issue not found." };

  const parsed = IssueStatus.safeParse(status);
  if (!parsed.success) return { ok: false, message: "Invalid status." };
  const next = parsed.data;

  if (next === "open") {
    // Reopen → drop the override so it reverts to the implicit "open" default.
    await db
      .delete(schema.issueOverrides)
      .where(and(eq(schema.issueOverrides.siteId, siteId), eq(schema.issueOverrides.issueKey, key)));
  } else {
    const fingerprint = await computeIssueFingerprint(userId, key);
    await db
      .insert(schema.issueOverrides)
      .values({ siteId, issueKey: key, status: next, fingerprint, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [schema.issueOverrides.siteId, schema.issueOverrides.issueKey],
        set: { status: next, fingerprint, updatedAt: new Date() },
      });
  }

  revalidatePath("/dashboard/issues");
  revalidatePath(`/dashboard/issues/${encodeURIComponent(key)}`);
  revalidatePath(`/dashboard/${siteId}`);
  return { ok: true, status: next };
}

/**
 * Bulk version of {@link setIssueStatus} — set the same status on many issues at once (the inbox's
 * "turn off selected" / "reopen selected"). Ownership is checked per key against the caller's sites;
 * keys for sites they don't own are silently skipped. Revalidates each touched surface once.
 */
export async function setIssuesStatus(
  keys: string[],
  status: string,
): Promise<{ ok: boolean; updated: number; message?: string }> {
  const { userId } = await verifySession();

  const parsed = IssueStatus.safeParse(status);
  if (!parsed.success) return { ok: false, updated: 0, message: "Invalid status." };
  const next = parsed.data;

  const owned = new Set(
    (
      await db
        .select({ id: schema.sites.id })
        .from(schema.sites)
        .where(eq(schema.sites.ownerId, userId))
    ).map((r) => r.id),
  );

  const touchedSites = new Set<string>();
  let updated = 0;
  for (const key of keys) {
    const sep = key.indexOf(":");
    if (sep < 0) continue;
    const siteId = key.slice(0, sep);
    if (!owned.has(siteId)) continue;

    if (next === "open") {
      await db
        .delete(schema.issueOverrides)
        .where(and(eq(schema.issueOverrides.siteId, siteId), eq(schema.issueOverrides.issueKey, key)));
    } else {
      const fingerprint = await computeIssueFingerprint(userId, key);
      await db
        .insert(schema.issueOverrides)
        .values({ siteId, issueKey: key, status: next, fingerprint, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [schema.issueOverrides.siteId, schema.issueOverrides.issueKey],
          set: { status: next, fingerprint, updatedAt: new Date() },
        });
    }
    updated++;
    touchedSites.add(siteId);
  }

  revalidatePath("/dashboard/issues");
  for (const siteId of touchedSites) {
    revalidatePath(`/dashboard/${siteId}`);
    revalidatePath(`/dashboard/${siteId}/issues`);
  }
  return { ok: true, updated };
}
