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
  /** Interval between scheduled monitor ticks (re-crawl all eligible sites), ms. Default 24h.
   *  Set to 0 to disable scheduled monitoring entirely. */
  MONITOR_INTERVAL_MS: Number(process.env.MONITOR_INTERVAL_MS ?? 24 * 60 * 60 * 1000),
  /** Email (Resend HTTP API). When RESEND_API_KEY + EMAIL_FROM are both set, alert emails are sent;
   *  otherwise the email layer no-ops (logs only). */
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
  /** Interval between weekly digest emails, ms. Default 7d. Set to 0 to disable digests. */
  DIGEST_INTERVAL_MS: Number(process.env.DIGEST_INTERVAL_MS ?? 7 * 24 * 60 * 60 * 1000),
};
