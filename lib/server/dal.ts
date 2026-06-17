import "server-only";

import { cache } from "react";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { db, schema } from "@/lib/server/db";

/**
 * Data Access Layer — the AUTHORITATIVE auth check (proxy.ts is only an optimistic
 * redirect). `auth()` cryptographically verifies the session JWT. Wrapped in React
 * `cache` so multiple calls within one render/request hit it once.
 */
export const verifySession = cache(async (): Promise<{ userId: string }> => {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return { userId: session.user.id };
});

/**
 * The signed-in user, minus the password hash. Redirects to /login if unauthed. If the session is
 * valid but its user no longer exists (deleted account, or a reset dev DB), the session is stale —
 * we route to /api/auth/stale-session to clear the cookie and bounce to /login, rather than return
 * null and let every protected page crash on `user!`. Always returns a user (or redirects).
 */
export const getUser = cache(async () => {
  const { userId } = await verifySession();
  const rows = await db
    .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!rows[0]) redirect("/api/auth/stale-session");
  return rows[0];
});
