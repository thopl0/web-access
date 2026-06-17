import "server-only";

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// Password hashing with Node's built-in scrypt — no bcrypt dependency. Format:
//   scrypt$<keylen>$<saltHex>$<hashHex>
// The params are embedded so stored hashes stay verifiable if we tune them later.
const scryptAsync = promisify(scrypt);
const KEYLEN = 64;
const SALT_BYTES = 16;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = (await scryptAsync(plain, salt, KEYLEN)) as Buffer;
  return `scrypt$${KEYLEN}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  try {
    const [scheme, keylenRaw, saltHex, hashHex] = stored.split("$");
    if (scheme !== "scrypt" || !keylenRaw || !saltHex || !hashHex) return false;

    const keylen = Number(keylenRaw);
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const derived = (await scryptAsync(plain, salt, keylen)) as Buffer;

    // Lengths must match before timingSafeEqual (it throws on mismatch).
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
