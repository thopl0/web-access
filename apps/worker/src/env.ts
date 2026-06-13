import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Load the monorepo-root .env regardless of cwd (src → apps/worker → apps → root).
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

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
  CONCURRENCY: Number(process.env.WORKER_CONCURRENCY ?? 2),
};
