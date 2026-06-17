import "server-only";

import { headers } from "next/headers";
import { env } from "./env";

/**
 * Canonical public origin baked into generated snippets and verification copy: `APP_ORIGIN` when
 * set, otherwise the current request's own host (derived from forwarded headers). Centralized here
 * so the dashboard, the onboarding wizard, and the createSite action all resolve it identically.
 */
export async function appOrigin(): Promise<string> {
  if (env.APP_ORIGIN) return env.APP_ORIGIN.replace(/\/+$/, "");
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}
