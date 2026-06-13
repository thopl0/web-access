import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Load the monorepo-root .env regardless of cwd (src → apps/api → apps → root).
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

export const env = {
  DATABASE_URL: required("DATABASE_URL"),
  REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6399",
  API_PORT: Number(process.env.API_PORT ?? 3001),
};
