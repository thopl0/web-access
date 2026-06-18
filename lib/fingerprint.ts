/**
 * Lightweight, dependency-free browser fingerprint for the public scan box. Combines stable device
 * traits + a canvas render into one hash. It is ONE signal among several (IP, cookie, target domain
 * all matter more) — not a unique identity, and trivially spoofable on its own, which is fine: it
 * just raises the cost of slipping past the free-scan limit. Client-only (uses window/canvas).
 */

function canvasHash(): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 60;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "no-2d";
    ctx.textBaseline = "top";
    ctx.font = "16px 'Arial'";
    ctx.fillStyle = "#f60";
    ctx.fillRect(10, 10, 100, 30);
    ctx.fillStyle = "#069";
    ctx.fillText("Inclusio ⚡ a11y", 12, 14);
    ctx.strokeStyle = "rgba(120,0,200,0.6)";
    ctx.arc(60, 30, 20, 0, Math.PI * 2);
    ctx.stroke();
    return canvas.toDataURL().slice(-96);
  } catch {
    return "no-canvas";
  }
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Compute the fingerprint hash. Returns "" when unavailable (SSR / locked-down browser). */
export async function computeFingerprint(): Promise<string> {
  if (typeof window === "undefined" || !crypto?.subtle) return "";
  const n = navigator;
  const s = window.screen;
  const nav = n as Navigator & { deviceMemory?: number };
  const parts = [
    n.userAgent,
    n.language,
    (n.languages ?? []).join(","),
    `${s.width}x${s.height}x${s.colorDepth}`,
    String(new Date().getTimezoneOffset()),
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
    String(nav.hardwareConcurrency ?? ""),
    String(nav.deviceMemory ?? ""),
    String(n.maxTouchPoints ?? ""),
    canvasHash(),
  ];
  try {
    return await sha256Hex(parts.join("|"));
  } catch {
    return "";
  }
}
