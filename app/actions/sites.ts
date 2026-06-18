"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ScanConfig, type SiteStatus } from "@web-access/shared";
import { db, schema } from "@/lib/server/db";
import { verifySession } from "@/lib/server/dal";
import { checkSnippetInstalled, installCheckMessage } from "@/lib/server/verify";
import { appOrigin } from "@/lib/server/origin";
import { embedSnippet } from "@/lib/embed";
import { enqueueCrawl, enqueueScan } from "@/lib/server/scan";
import { notifySiteVerified } from "@/lib/server/notify";
import { purgeSiteBlobs } from "@/lib/server/storage";

export type SiteFormState =
  | {
      errors?: {
        name?: string[];
        origin?: string[];
        _form?: string[];
      };
      ok?: boolean;
      /** On success: the new site's id + its ready-to-paste snippet, so the wizard can advance. */
      siteId?: string;
      snippet?: string;
    }
  | undefined;

const SiteSchema = z.object({
  name: z.string().trim().min(1, { message: "Give your site a name." }).max(120),
  // URL is required now — it powers active verification, "open your site" links, and the crawler.
  origin: z
    .string()
    .trim()
    .min(1, { message: "Enter your site's URL." })
    .url({ message: "Enter a full URL, e.g. https://example.com" }),
});

function newSiteId(): string {
  return `site_${randomUUID().replace(/-/g, "")}`;
}

export async function createSite(
  _prev: SiteFormState,
  formData: FormData,
): Promise<SiteFormState> {
  // Authoritative auth check inside the action (proxy is only optimistic).
  const { userId } = await verifySession();

  const parsed = SiteSchema.safeParse({
    name: formData.get("name"),
    origin: formData.get("origin") || "",
  });
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const { name, origin: siteUrl } = parsed.data;
  // Store the origin (scheme + host), not the full path — that's the unit we verify and crawl.
  let origin = siteUrl;
  try {
    origin = new URL(siteUrl).origin;
  } catch {
    /* validated as a URL above; keep the raw value if parsing somehow fails */
  }

  // Generate a unique id; retry once on the (astronomically unlikely) collision.
  let id = newSiteId();
  const clash = await db
    .select({ id: schema.sites.id })
    .from(schema.sites)
    .where(eq(schema.sites.id, id))
    .limit(1);
  if (clash.length > 0) id = newSiteId();

  await db.insert(schema.sites).values({ id, ownerId: userId, name, origin });

  revalidatePath("/dashboard");
  return { ok: true, siteId: id, snippet: embedSnippet(await appOrigin(), id) };
}

/** Load a site the caller owns, or null. Centralizes the ownership check the actions share. */
async function ownedSite(siteId: string, userId: string) {
  const rows = await db
    .select()
    .from(schema.sites)
    .where(and(eq(schema.sites.id, siteId), eq(schema.sites.ownerId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export type VerifyResult =
  | { status: SiteStatus; verified: true }
  | { status: SiteStatus; verified: false; message: string };

/**
 * Active "Check now": fetch the site's origin and confirm the snippet is live, flipping the site
 * to verified on success. The passive path (first embed ping → ingest) verifies the same way; this
 * just lets an owner trigger it on demand instead of waiting for traffic.
 */
export async function checkInstall(siteId: string): Promise<VerifyResult> {
  const { userId } = await verifySession();
  const site = await ownedSite(siteId, userId);
  if (!site) return { status: "pending", verified: false, message: "Site not found." };

  // Already verified (e.g. a ping landed first) — nothing to do.
  if (site.status === "verified") return { status: "verified", verified: true };

  const check = await checkSnippetInstalled(site.origin, siteId);
  if (!check.ok) {
    return { status: site.status, verified: false, message: installCheckMessage(check) };
  }

  await db
    .update(schema.sites)
    .set({ status: "verified", verifiedAt: new Date(), lastSeenAt: new Date() })
    .where(eq(schema.sites.id, siteId));

  // Discover the rest of the site's pages now that we know it's live (best-effort).
  if (site.scanConfig.autoCrawl) {
    await enqueueCrawl(siteId, site.origin, "verified").catch(() => {});
  }
  void notifySiteVerified(siteId).catch(() => {});

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/${siteId}`);
  return { status: "verified", verified: true };
}

/** Re-crawl a site on demand: re-discover its pages and queue fresh scans. */
export async function recrawlSite(siteId: string): Promise<{ ok: boolean; message?: string }> {
  const { userId } = await verifySession();
  const site = await ownedSite(siteId, userId);
  if (!site) return { ok: false, message: "Site not found." };
  if (!site.origin) return { ok: false, message: "Add a site URL first." };

  await enqueueCrawl(siteId, site.origin, "manual");
  revalidatePath(`/dashboard/${siteId}`);
  revalidatePath(`/dashboard/${siteId}/pages`);
  return { ok: true };
}

/** Re-scan a single monitored page on demand. Uses a unique release id so it always runs. */
export async function rescanPage(
  siteId: string,
  url: string,
): Promise<{ ok: boolean; message?: string }> {
  const { userId } = await verifySession();
  const site = await ownedSite(siteId, userId);
  if (!site) return { ok: false, message: "Site not found." };

  await enqueueScan({
    siteId,
    url,
    releaseId: `manual:${randomUUID()}`,
    templateFingerprint: "manual",
  });
  revalidatePath(`/dashboard/${siteId}`);
  revalidatePath(`/dashboard/${siteId}/pages`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Settings actions
// ---------------------------------------------------------------------------

const UpdateSiteSchema = z.object({
  name: z.string().trim().min(1, { message: "Give your site a name." }).max(120),
  origin: z
    .string()
    .trim()
    .min(1, { message: "Enter your site's URL." })
    .url({ message: "Enter a full URL, e.g. https://example.com" }),
});

/** Rename a site / change its URL. */
export async function updateSite(
  _prev: SiteFormState,
  formData: FormData,
): Promise<SiteFormState> {
  const { userId } = await verifySession();
  const siteId = String(formData.get("siteId") ?? "");
  const site = await ownedSite(siteId, userId);
  if (!site) return { errors: { _form: ["Site not found."] } };

  const parsed = UpdateSiteSchema.safeParse({
    name: formData.get("name"),
    origin: formData.get("origin") || "",
  });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  let origin = parsed.data.origin;
  try {
    origin = new URL(parsed.data.origin).origin;
  } catch {
    /* validated above */
  }

  await db
    .update(schema.sites)
    .set({ name: parsed.data.name, origin })
    .where(eq(schema.sites.id, siteId));

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/${siteId}`);
  revalidatePath(`/dashboard/${siteId}/settings`);
  return { ok: true };
}

export type ScanConfigState = { ok?: boolean; error?: string } | undefined;

/** Update the site's page-access control (which pages we scan + crawl behaviour). */
export async function updateScanConfig(
  _prev: ScanConfigState,
  formData: FormData,
): Promise<ScanConfigState> {
  const { userId } = await verifySession();
  const siteId = String(formData.get("siteId") ?? "");
  const site = await ownedSite(siteId, userId);
  if (!site) return { error: "Site not found." };

  const patterns = String(formData.get("patterns") ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const parsed = ScanConfig.safeParse({
    mode: formData.get("mode"),
    patterns,
    autoCrawl: formData.get("autoCrawl") === "on",
    pageCap: Number(formData.get("pageCap") ?? 25),
  });
  if (!parsed.success) return { error: "Those settings don't look right — check the page cap." };

  await db
    .update(schema.sites)
    .set({ scanConfig: parsed.data })
    .where(eq(schema.sites.id, siteId));

  revalidatePath(`/dashboard/${siteId}/settings`);
  return { ok: true };
}

/** Pause or resume monitoring. Paused sites keep their data + heartbeat but aren't scanned. */
export async function setSitePaused(
  siteId: string,
  paused: boolean,
): Promise<{ ok: boolean; status?: SiteStatus }> {
  const { userId } = await verifySession();
  const site = await ownedSite(siteId, userId);
  if (!site) return { ok: false };

  // Resuming returns to verified if it was ever verified, else back to pending.
  const next: SiteStatus = paused ? "paused" : site.verifiedAt ? "verified" : "pending";
  await db.update(schema.sites).set({ status: next }).where(eq(schema.sites.id, siteId));

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/${siteId}`);
  revalidatePath(`/dashboard/${siteId}/settings`);
  return { ok: true, status: next };
}

/** Turn a site's public read-only report link on/off. Returns the token (null when off). */
export async function setSiteSharing(
  siteId: string,
  enabled: boolean,
): Promise<{ ok: boolean; token: string | null }> {
  const { userId } = await verifySession();
  const site = await ownedSite(siteId, userId);
  if (!site) return { ok: false, token: null };

  // Keep an existing token when re-enabling so live links don't break; clear it when disabling.
  const token = enabled ? (site.shareToken ?? randomUUID().replace(/-/g, "")) : null;
  await db.update(schema.sites).set({ shareToken: token }).where(eq(schema.sites.id, siteId));

  revalidatePath(`/dashboard/${siteId}/settings`);
  return { ok: true, token };
}

export type DeleteSiteState = { error?: string } | undefined;

/** Permanently delete a site and everything under it. Requires typing the site name to confirm. */
export async function deleteSite(
  _prev: DeleteSiteState,
  formData: FormData,
): Promise<DeleteSiteState> {
  const { userId } = await verifySession();
  const siteId = String(formData.get("siteId") ?? "");
  const site = await ownedSite(siteId, userId);
  if (!site) return { error: "Site not found." };

  if (String(formData.get("confirm") ?? "").trim() !== site.name) {
    return { error: "Type the site name exactly to confirm." };
  }

  // Remove the site's screenshots/evidence from object storage first (DB cascades don't reach it).
  // Best-effort: a failure here must not block the delete, so purgeSiteBlobs swallows its own errors.
  await purgeSiteBlobs(siteId);

  // scans aren't FK-linked to sites, so delete them first (cascades findings → evidence /
  // explanations); deleting the site then cascades its issueOverrides.
  await db.delete(schema.scans).where(eq(schema.scans.siteId, siteId));
  await db
    .delete(schema.sites)
    .where(and(eq(schema.sites.id, siteId), eq(schema.sites.ownerId, userId)));

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

/** Lightweight status read for the VerifyPanel's poll loop (owner-checked). */
export async function getVerificationStatus(
  siteId: string,
): Promise<{ status: SiteStatus; lastSeenAt: string | null }> {
  const { userId } = await verifySession();
  const site = await ownedSite(siteId, userId);
  if (!site) return { status: "pending", lastSeenAt: null };
  return {
    status: site.status,
    lastSeenAt: site.lastSeenAt ? site.lastSeenAt.toISOString() : null,
  };
}
