import { createDb, schema } from "@web-access/db";
import { env } from "./env";

// Single Drizzle client for the whole app (route handlers + worker share this module).
export const db = createDb(env.DATABASE_URL);
export { schema };
