import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { getConnection } from "./queue";

// Password-reset tokens live in Redis (already a core dependency), not Postgres: they're short-lived,
// single-use, and ephemeral, so Redis's native TTL is a perfect fit — and it needs no schema/migration.
// The raw token only ever exists in the email link; Redis stores just its SHA-256 hash → userId, so a
// Redis dump can't mint a working link.
const TOKEN_TTL_SECONDS = 60 * 60; // links are valid for 1 hour
const COOLDOWN_SECONDS = 2 * 60; // one reset email per account per 2 minutes (anti-flood)

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
const tokenKey = (hash: string) => `pwreset:token:${hash}`;
const cooldownKey = (userId: string) => `pwreset:cooldown:${userId}`;

/**
 * Issue a reset token for a user and return the RAW token (for the email link). Returns null when a
 * token was issued for this user within the cooldown window — so repeated "forgot password" clicks
 * can't flood their inbox.
 */
export async function createPasswordReset(userId: string): Promise<string | null> {
  const r = getConnection();
  const fresh = await r.set(cooldownKey(userId), "1", "EX", COOLDOWN_SECONDS, "NX");
  if (fresh === null) return null; // still within the cooldown

  const raw = randomBytes(32).toString("base64url");
  await r.set(tokenKey(hashToken(raw)), userId, "EX", TOKEN_TTL_SECONDS);
  return raw;
}

/**
 * Validate and CONSUME a raw token atomically (GETDEL), so a link works exactly once. Returns the
 * userId on success, or null if the token is unknown, expired, or already used.
 */
export async function consumePasswordReset(raw: string): Promise<string | null> {
  const r = getConnection();
  return r.getdel(tokenKey(hashToken(raw)));
}
