import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/** Create a Drizzle client bound to a Postgres URL. Callers own the lifecycle.
 *  `idle_timeout` closes idle connections so a leaked pool (e.g. an HMR-orphaned client) drains
 *  itself instead of pinning a slot forever; `max` bounds the pool so one process can't exhaust
 *  Postgres' connection limit. */
export function createDb(url: string) {
  const client = postgres(url, {
    max: Number(process.env.PG_POOL_MAX ?? 10),
    idle_timeout: 20,
  });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;
