import { getConnection } from "./queue";

/**
 * Abuse limiting for anonymous "scan your site" submissions. The goal (per product): a random
 * visitor gets 3 free page scans a week, and it should be as hard as practical to slip past that —
 * we know it can't be absolute.
 *
 * We can't trust any single identifier, so we count each scan against SEVERAL keys at once and block
 * if ANY of them is already at the limit:
 *   - ip           — the network they came from
 *   - fp           — a browser fingerprint computed client-side
 *   - cid          — a long-lived first-party cookie
 *   - dom          — the TARGET domain being scanned
 *
 * The target-domain key is the important one: the thing a determined re-scanner keeps constant is
 * the site they want to scan. Rotating IP / clearing cookies / spoofing the fingerprint still trips
 * the per-domain counter, so a given domain can only be anonymously scanned LIMIT times a week
 * regardless of how the requester disguises themselves.
 *
 * Counters are rolling 7-day windows (TTL set on first increment). Tunable below.
 */

export const PUBLIC_WEEKLY_LIMIT = 3;
const WINDOW_SECONDS = 7 * 24 * 60 * 60;
// Light burst guard so a single IP can't hammer the queue, independent of the weekly cap.
const BURST_SECONDS = 10;

export type ScanSignals = {
  ip?: string | undefined;
  fp?: string | undefined;
  cookieId: string;
  domain: string;
};

export type LimitResult =
  | { ok: true }
  | { ok: false; reason: "rate_limited" | "too_fast" };

function keysFor(s: ScanSignals): string[] {
  const keys = [`pub:scan:cid:${s.cookieId}`, `pub:scan:dom:${s.domain}`];
  if (s.ip) keys.push(`pub:scan:ip:${s.ip}`);
  if (s.fp) keys.push(`pub:scan:fp:${s.fp}`);
  return keys;
}

/**
 * Check every identity/target counter and, if all are under the limit, consume one unit from each.
 * Returns `rate_limited` when any counter is already at the cap, or `too_fast` on burst.
 */
export async function checkAndConsumePublicScan(s: ScanSignals): Promise<LimitResult> {
  const r = getConnection();

  // Burst guard (per IP, or per cookie when IP is unknown).
  const burstId = s.ip ?? s.cookieId;
  const fresh = await r.set(`pub:scan:burst:${burstId}`, "1", "EX", BURST_SECONDS, "NX");
  if (fresh === null) return { ok: false, reason: "too_fast" };

  const keys = keysFor(s);
  const counts = await r.mget(...keys);
  if (counts.some((c) => c !== null && Number(c) >= PUBLIC_WEEKLY_LIMIT)) {
    return { ok: false, reason: "rate_limited" };
  }

  // Consume: INCR each, then set the window TTL on any key we just created.
  const incr = r.pipeline();
  for (const k of keys) incr.incr(k);
  const results = await incr.exec();

  const expire = r.pipeline();
  results?.forEach(([err, val], i) => {
    if (!err && Number(val) === 1) expire.expire(keys[i]!, WINDOW_SECONDS);
  });
  await expire.exec();

  return { ok: true };
}
