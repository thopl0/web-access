import { desc, eq } from "drizzle-orm";

import { AppShell } from "@/components/dashboard/AppShell";
import { getUser } from "@/lib/server/dal";
import { db, schema } from "@/lib/server/db";
import { getOpenIssueOverview } from "@/lib/server/issues";
import { countUnreadNotifications } from "@/lib/server/notifications";

export const dynamic = "force-dynamic";

/** Signed-in app shell: a persistent sidebar (overview + site switcher + account)
 *  around every dashboard route. getUser() redirects to /login if unauthed, so this
 *  layout gates the whole group. Sidebar critical-counts use the lifecycle-aware open
 *  stats (one pass over the user's sites) so they agree with the Issues tab. */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getUser();

  const sites = await db
    .select({ id: schema.sites.id, name: schema.sites.name })
    .from(schema.sites)
    .where(eq(schema.sites.ownerId, user!.id))
    .orderBy(desc(schema.sites.createdAt));

  // Sidebar critical badges reuse the lifecycle-aware open stats, so they match the Issues tab (a
  // fixed/auto-fixed critical no longer lights up the sidebar). One pass over the user's sites.
  const { bySite } = await getOpenIssueOverview(user!.id);
  const nav = sites.map((s) => ({
    id: s.id,
    name: s.name,
    critical: bySite.get(s.id)?.criticalTypes ?? 0,
  }));

  const notificationsUnread = await countUnreadNotifications(user!.id);

  return (
    <AppShell
      user={{ name: user!.name, email: user!.email }}
      sites={nav}
      notificationsUnread={notificationsUnread}
    >
      {children}
    </AppShell>
  );
}
