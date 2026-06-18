import { config } from "dotenv";

// Next loads .env itself for route handlers; the standalone worker (run via tsx) does not, so we
// load it here too. cwd is always the repo root for both `next` and the worker scripts.
config();

function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

export const env = {
  DATABASE_URL: required("DATABASE_URL"),
  REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6399",
  /** Secret used by Auth.js to sign session JWTs. Generate: `openssl rand -base64 32`. */
  AUTH_SECRET: required("AUTH_SECRET"),
  /** Canonical public origin baked into generated embed snippets. Falls back to the
   *  request's own origin (derived from headers) when unset. */
  APP_ORIGIN: process.env.APP_ORIGIN,
  /** Google OAuth credentials. Optional — when both are set, "Continue with
   *  Google" is enabled; otherwise only email/password sign-in is available. */
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  /** GLM (Zhipu AI) key powering the Tier-3 AI judge. A GLM Coding Plan key works — it's served
   *  via GLM's Anthropic-compatible Messages API (set GLM_BASE_URL to the `/api/anthropic`
   *  endpoint). Optional — when unset, the AI analyzer no-ops and only the deterministic tiers run.
   *  The analyzers package reads these from `process.env` directly (it must not import server-only
   *  modules); declared here as the canonical env contract. See
   *  `lib/packages/analyzers/ai/glm.ts`. */
  GLM_API_KEY: process.env.GLM_API_KEY,
  GLM_BASE_URL: process.env.GLM_BASE_URL,
  GLM_TEXT_MODEL: process.env.GLM_TEXT_MODEL,
  GLM_VISION_MODEL: process.env.GLM_VISION_MODEL,
  /** Hard cap on page navigation, ms. */
  NAV_TIMEOUT_MS: Number(process.env.NAV_TIMEOUT_MS ?? 30000),
  /** How many render jobs the worker processes concurrently. */
  CONCURRENCY: Number(process.env.WORKER_CONCURRENCY ?? 2),
  /** Object storage for screenshots + evidence crops (see lib/server/storage.ts). Driver is
   *  auto-selected when STORAGE_DRIVER is unset: R2 if its creds are present, else local disk.
   *  - `local` (dev): bytes under STORAGE_DIR; no cloud bucket needed.
   *  - `r2` (prod): Cloudflare R2 via the S3 API. */
  STORAGE_DRIVER: process.env.STORAGE_DRIVER as "local" | "r2" | undefined,
  /** Local driver root (relative to repo cwd). */
  STORAGE_DIR: process.env.STORAGE_DIR ?? ".data/storage",
  /** Cloudflare R2 (S3-compatible). Required when the driver resolves to `r2`. R2_API_ENDPOINT is the
   *  bucket's S3 endpoint (Cloudflare gives `https://<account>.r2.cloudflarestorage.com/<bucket>`);
   *  when unset it's built from R2_ACCOUNT_ID + R2_BUCKET_NAME. R2_ACCESS_KEY is the secret. */
  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
  R2_ACCESS_KEY: process.env.R2_ACCESS_KEY,
  R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
  R2_API_ENDPOINT: process.env.R2_API_ENDPOINT,
  /** Public bucket URL (r2.dev / custom domain). Intentionally UNUSED: images are streamed through
   *  the access-controlled routes instead, since evidence keys are sequential and a public bucket
   *  would let anyone enumerate other users' screenshots. Kept here only to document the contract. */
  R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,
  /** Interval between scheduled monitor ticks (re-crawl all eligible sites), ms. Default 24h.
   *  Set to 0 to disable scheduled monitoring entirely. */
  MONITOR_INTERVAL_MS: Number(process.env.MONITOR_INTERVAL_MS ?? 24 * 60 * 60 * 1000),
  /** Email (Resend HTTP API). When RESEND_API_KEY + EMAIL_FROM are both set, alert emails are sent;
   *  otherwise the email layer no-ops (logs only). */
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
  /** Interval between weekly digest emails, ms. Default 7d. Set to 0 to disable digests. */
  DIGEST_INTERVAL_MS: Number(process.env.DIGEST_INTERVAL_MS ?? 7 * 24 * 60 * 60 * 1000),
  /** Stripe billing. ALL optional — when STRIPE_SECRET_KEY is unset the billing layer no-ops the same
   *  way email (RESEND_API_KEY) and the AI judge (GLM_API_KEY) do: getStripe() returns null, checkout/
   *  portal degrade to a "billing not configured" state, and the webhook 503s. Nothing crashes.
   *  - STRIPE_SECRET_KEY      — server-side API key (`sk_...`). The single switch that enables billing.
   *  - STRIPE_WEBHOOK_SECRET  — signing secret (`whsec_...`) the webhook verifies the raw body against.
   *  - STRIPE_PRICE_PRO / STRIPE_PRICE_BUSINESS — recurring price ids checkout charges; also the map
   *    used (in reverse) by the webhook to resolve a Stripe price back to one of our plans. */
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  STRIPE_PRICE_PRO: process.env.STRIPE_PRICE_PRO,
  STRIPE_PRICE_BUSINESS: process.env.STRIPE_PRICE_BUSINESS,
};
