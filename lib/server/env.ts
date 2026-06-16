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
  /** Hard cap on page navigation, ms. */
  NAV_TIMEOUT_MS: Number(process.env.NAV_TIMEOUT_MS ?? 30000),
  /** How many render jobs the worker processes concurrently. */
  CONCURRENCY: Number(process.env.WORKER_CONCURRENCY ?? 2),
};
