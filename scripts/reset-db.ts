/**
 * Dev reset: wipe ALL data for a clean slate, and ensure the screenshot-annotation schema
 * (scan_shots table + evidence.page_x/page_y) exists so fresh scans capture evidence coordinates.
 *
 * Run with `pnpm db:reset` (tsx). Destructive — truncates every table. Auth is JWT-based (no
 * sessions table), so clearing `users` simply invalidates existing logins; re-register fresh.
 */
import { sql } from "drizzle-orm";
import { db } from "../lib/server/db";

async function main(): Promise<void> {
  // Additive, idempotent schema for the annotated-screenshot feature.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS scan_shots (
      scan_id text PRIMARY KEY REFERENCES scans(id) ON DELETE CASCADE,
      png_base64 text NOT NULL,
      width integer NOT NULL,
      height integer NOT NULL
    )
  `);
  await db.execute(sql`ALTER TABLE evidence ADD COLUMN IF NOT EXISTS page_x integer`);
  await db.execute(sql`ALTER TABLE evidence ADD COLUMN IF NOT EXISTS page_y integer`);

  // Clean slate. CASCADE clears FK-dependent rows; scans is listed explicitly (not FK'd to sites).
  await db.execute(sql`
    TRUNCATE TABLE
      users, sites, scans, findings, evidence, finding_explanations, issue_overrides, scan_shots
    RESTART IDENTITY CASCADE
  `);

  console.log("db reset complete — schema applied, all data cleared. Re-register to start fresh.");
  process.exit(0);
}

main().catch((err) => {
  console.error("db reset failed:", err);
  process.exit(1);
});
