import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";

import { db, schema } from "./db";

// Password-reset token lifecycle. The raw token only ever exists in the email link; the DB stores
// just its SHA-256 hash, so a database read can't mint a working reset link.
const TOKEN_TTL_MS = 60 * 60 * 1000; // links are valid for 1 hour
const RESEND_COOLDOWN_MS = 2 * 60 * 1000; // don't email the same account more than once per 2 min

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Issue a reset token for a user and return the RAW token (to embed in the email link). Returns null
 * when a token was issued for this user within the cooldown window — so repeated "forgot password"
 * clicks can't flood their inbox.
 */
export async function createPasswordReset(userId: string): Promise<string | null> {
  const recent = await db
    .select({ createdAt: schema.passwordResetTokens.createdAt })
    .from(schema.passwordResetTokens)
    .where(eq(schema.passwordResetTokens.userId, userId))
    .orderBy(desc(schema.passwordResetTokens.createdAt))
    .limit(1);
  if (recent[0] && Date.now() - recent[0].createdAt.getTime() < RESEND_COOLDOWN_MS) {
    return null;
  }

  const raw = randomBytes(32).toString("base64url");
  await db.insert(schema.passwordResetTokens).values({
    id: `prt_${randomUUID()}`,
    userId,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
  });
  return raw;
}

/**
 * Validate and CONSUME a raw token. Returns the userId on success — and marks every reset token for
 * that user used, so the link is strictly single-use and any others are invalidated. Returns null if
 * the token is unknown, already used, or expired.
 */
export async function consumePasswordReset(raw: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(schema.passwordResetTokens)
    .where(eq(schema.passwordResetTokens.tokenHash, hashToken(raw)))
    .limit(1);
  const row = rows[0];
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) return null;

  await db
    .update(schema.passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(schema.passwordResetTokens.userId, row.userId));
  return row.userId;
}
