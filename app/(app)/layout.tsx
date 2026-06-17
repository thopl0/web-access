import { desc, eq } from "drizzle-orm";

import { AppShell } from "@/components/dashboard/AppShell";
import { getUser } from "@/lib/server/dal";
import { db, schema } from "@/lib/server/db";
import { getSiteSummary } from "@/lib/server/report";

export const dynamic = "force-dynamic";

/** Signed-in app shell: a persistent sidebar (overview + site switcher + account)
 *  around every dashboard route. getUser() redirects to /login if unauthed, so this
 *  layout gates the whole group. Sidebar critical-counts reuse the request-cached
 *  per-site summary, so they don't add queries the pages don't already run. */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getUser();

  const sites = await db
    .select({ id: schema.sites.id, name: schema.sites.name })
    .from(schema.sites)
    .where(eq(schema.sites.ownerId, user!.id))
    .orderBy(desc(schema.sites.createdAt));

  const nav = await Promise.all(
    sites.map(async (s) => ({
      id: s.id,
      name: s.name,
      critical: (await getSiteSummary(s.id)).counts.critical,
    })),
  );

  return (
    <AppShell user={{ name: user!.name, email: user!.email }} sites={nav}>
      {children}
    </AppShell>
  );
}
