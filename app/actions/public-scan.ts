"use server";

import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { db, schema } from "@/lib/server/db";
import { enqueueScan } from "@/lib/server/scan";
import { assertScannableUrl } from "@/lib/server/url-guard";
import {
  PUBLIC_WEEKLY_LIMIT,
  checkAndConsumePublicScan,
} from "@/lib/server/public-scan-limit";

export type PublicScanState = { error?: string } | undefined;

/** Long-lived first-party cookie used as one of the anti-abuse signals. */
const CID_COOKIE = "wa_cid";
const CID_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/** Best-effort real client IP. Behind Cloudflare + nginx, CF-Connecting-IP is the original client. */
function clientIp(h: Headers): string | undefined {
  const cf = h.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return h.get("x-real-ip")?.trim() || undefined;
}

/**
 * Public, unauthenticated scan from the home-page box. Validates + SSRF-checks the URL, enforces the
 * anonymous weekly limit across several abuse signals, then spins up an ownerless, shareable site
 * with a single queued page scan and sends the visitor to its live result page.
 */
export async function startPublicScan(
  _prev: PublicScanState,
  formData: FormData,
): Promise<PublicScanState> {
  const rawInput = String(formData.get("url") ?? "").trim();
  if (!rawInput) return { error: "Enter your site's URL to scan it." };
  const fp = String(formData.get("fp") ?? "").trim().slice(0, 64) || undefined;

  // Accept "example.com" as well as a full URL; default to https when no scheme is given.
  const candidate = /^https?:\/\//i.test(rawInput) ? rawInput : `https://${rawInput}`;

  const guard = await assertScannableUrl(candidate);
  if (!guard.ok) return { error: guard.reason };

  const h = await headers();
  const ip = clientIp(h);

  // First-party cookie: read existing, mint one if absent (and persist it for next time).
  const jar = await cookies();
  let cookieId = jar.get(CID_COOKIE)?.value;
  if (!cookieId) {
    cookieId = randomUUID();
    jar.set(CID_COOKIE, cookieId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: CID_MAX_AGE,
      path: "/",
    });
  }

  const domain = guard.host.replace(/^www\./, "");

  const limit = await checkAndConsumePublicScan({ ip, fp, cookieId, domain });
  if (!limit.ok) {
    return {
      error:
        limit.reason === "too_fast"
          ? "One scan at a time — give the last one a few seconds."
          : `You've used your ${PUBLIC_WEEKLY_LIMIT} free scans this week. Create a free account to keep scanning and monitor continuously.`,
    };
  }

  // Ownerless, shareable site holding this one trial scan. status "pending" keeps it out of the
  // scheduled monitor (which only re-crawls verified sites); it never appears in any dashboard.
  const siteId = `site_${randomUUID().replace(/-/g, "")}`;
  const shareToken = randomUUID().replace(/-/g, "");
  await db.insert(schema.sites).values({
    id: siteId,
    ownerId: null,
    name: domain,
    origin: new URL(guard.url).origin,
    shareToken,
    status: "pending",
  });

  // Single-page scan only — no crawl. Unique releaseId so it never dedups against another.
  await enqueueScan({
    siteId,
    url: guard.url,
    releaseId: `public:${randomUUID()}`,
    templateFingerprint: "single",
  });

  redirect(`/scan/${shareToken}`);
}
