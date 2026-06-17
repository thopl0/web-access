/**
 * Idempotent seed. Run with `pnpm db:seed` (tsx).
 *
 * Seeds the system "demo-site" so the public demo (public/demo/index.html, which
 * embeds with data-site-id="demo-site") keeps working now that the ingest API
 * rejects unregistered siteIds. It's unowned (ownerId = null) so it never shows
 * up in any user's dashboard.
 */
import { db, schema } from "../lib/server/db";

async function main(): Promise<void> {
  const inserted = await db
    .insert(schema.sites)
    .values({ id: "demo-site", ownerId: null, name: "Demo site", status: "verified" })
    // Keep the demo verified even if it predates the status column.
    .onConflictDoUpdate({ target: schema.sites.id, set: { status: "verified" } })
    .returning({ id: schema.sites.id });

  console.log(
    inserted.length > 0 ? "seeded demo-site" : "demo-site already present — nothing to do",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("seed failed:", err);
  process.exit(1);
});
