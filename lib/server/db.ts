import { createDb, schema } from "@web-access/db";
import { env } from "./env";

// Single Drizzle client for the whole app (route handlers + worker share this module).
//
// Cached on globalThis so HMR reloads in `next dev` reuse ONE pool. Without this, every module
// re-evaluation opened a fresh Postgres pool and orphaned the previous one, leaking connections
// until the server hit Postgres' max_connections. In production the module evaluates once.
const globalForDb = globalThis as unknown as { __waDb?: ReturnType<typeof createDb> };
export const db = globalForDb.__waDb ?? createDb(env.DATABASE_URL);
if (process.env.NODE_ENV !== "production") globalForDb.__waDb = db;
export { schema };
