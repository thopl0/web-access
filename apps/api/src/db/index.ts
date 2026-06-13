import { createDb, schema } from "@web-access/db";
import { env } from "../env.js";

export const db = createDb(env.DATABASE_URL);
export { schema };
