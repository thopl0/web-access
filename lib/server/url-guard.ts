import { lookup } from "node:dns/promises";
import net from "node:net";

/**
 * SSRF guard for URLs submitted by anonymous visitors (the public "scan your site" box). The worker
 * navigates to whatever URL we accept, so an unguarded form is a server-side request forgery hole:
 * an attacker could point us at cloud metadata (169.254.169.254), localhost, or internal hosts.
 *
 * We require http(s), reject credentials in the URL, and resolve the hostname — blocking the request
 * if the name itself is internal or if ANY resolved address is loopback/private/link-local/reserved.
 * Residual risk: DNS rebinding between this check and the worker's fetch; acceptable for a free
 * trial, and far tighter than no check. Authenticated scans don't go through here.
 */

export type UrlGuardResult =
  | { ok: true; url: string; host: string }
  | { ok: false; reason: string };

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home", ".corp"];

function isPrivateIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true; // malformed → unsafe
  const [a, b] = p as [number, number, number, number];
  if (a === 0 || a === 127) return true; // this-host / loopback
  if (a === 10) return true; // private
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata)
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 192 && b === 0) return true; // 192.0.0/24, 192.0.2/24 (test/reserved)
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const addr = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (addr === "::1" || addr === "::") return true; // loopback / unspecified
  // IPv4-mapped (::ffff:1.2.3.4) — judge by the embedded v4.
  const mapped = addr.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return isPrivateIPv4(mapped[1]!);
  if (addr.startsWith("fe80")) return true; // link-local
  if (addr.startsWith("fc") || addr.startsWith("fd")) return true; // unique-local (fc00::/7)
  return false;
}

function isPrivateAddress(ip: string): boolean {
  const fam = net.isIP(ip);
  if (fam === 4) return isPrivateIPv4(ip);
  if (fam === 6) return isPrivateIPv6(ip);
  return true; // not a recognizable IP → treat as unsafe
}

export async function assertScannableUrl(raw: string): Promise<UrlGuardResult> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: "That doesn't look like a valid web address." };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "Enter an http:// or https:// URL." };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "URLs with credentials aren't allowed." };
  }

  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    return { ok: false, reason: "That address points somewhere private — try a public URL." };
  }

  // If the host is a literal IP, judge it directly; otherwise resolve and judge every answer.
  // URL.hostname keeps the brackets on IPv6 literals ([::1]) — strip them for the IP check.
  const ipLiteral = host.replace(/^\[/, "").replace(/\]$/, "");
  if (net.isIP(ipLiteral)) {
    if (isPrivateAddress(ipLiteral)) {
      return { ok: false, reason: "That address points somewhere private — try a public URL." };
    }
  } else {
    let addrs: { address: string }[];
    try {
      addrs = await lookup(host, { all: true });
    } catch {
      return { ok: false, reason: "We couldn't resolve that domain. Check the spelling?" };
    }
    if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) {
      return { ok: false, reason: "That address points somewhere private — try a public URL." };
    }
  }

  return { ok: true, url: parsed.toString(), host };
}
