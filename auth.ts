import { randomUUID } from "node:crypto";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/lib/server/db";
import { env } from "@/lib/server/env";
import { verifyPassword } from "@/lib/server/password";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** Whether "Continue with Google" is available (both OAuth creds present). */
export const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

/**
 * Map an OAuth (Google) identity onto our own `users` table, keyed by email so a
 * Google login and an email/password login with the same address are the same
 * account. Returns our internal `usr_` id. OAuth users have a null passwordHash.
 */
async function upsertOAuthUser(email: string, name: string | null): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const id = `usr_${randomUUID()}`;
  const inserted = await db
    .insert(schema.users)
    .values({ id, email: normalized, name, passwordHash: null })
    .onConflictDoNothing({ target: schema.users.email })
    .returning({ id: schema.users.id });
  if (inserted[0]) return inserted[0].id;

  // Already existed (or a concurrent insert won) — look it up.
  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, normalized))
    .limit(1);
  return existing[0]!.id;
}

const providers: NextAuthConfig["providers"] = [
  Credentials({
    credentials: { email: {}, password: {} },
    async authorize(raw) {
      const parsed = credentialsSchema.safeParse(raw);
      if (!parsed.success) return null;

      const email = parsed.data.email.trim().toLowerCase();
      const found = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, email))
        .limit(1);
      const user = found[0];
      // No user, or an OAuth-only account (null hash) → no password login.
      if (!user || !user.passwordHash) return null;

      const ok = await verifyPassword(parsed.data.password, user.passwordHash);
      if (!ok) return null;

      return { id: user.id, email: user.email, name: user.name ?? undefined };
    },
  }),
];

if (googleEnabled) {
  providers.push(
    Google({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    }),
  );
}

/**
 * Auth.js v5 config. JWT sessions (the Credentials provider can't use database
 * sessions) backed by our own `users` table — no adapter needed. The session
 * carries only the user id; everything else is fetched server-side via the DAL.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers,
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        if (account?.provider === "credentials") {
          // authorize() already returned our internal id.
          token.id = user.id;
        } else if (user.email) {
          // OAuth sign-in: map the identity onto our users table by email.
          token.id = await upsertOAuthUser(user.email, user.name ?? null);
        }
      }
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = String(token.id);
      return session;
    },
  },
});
