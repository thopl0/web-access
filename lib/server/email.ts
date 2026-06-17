// Provider-agnostic email layer. Sends via the Resend HTTP API when RESEND_API_KEY + EMAIL_FROM are
// configured; otherwise no-ops (logs the intended send) so the app runs fine without email set up.
// NOT `import "server-only"` — shared with the BullMQ worker (digests / critical alerts).
import { env } from "./env";

export type Mail = { to: string; subject: string; html: string; text?: string };

export function emailConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
}

export async function sendEmail(mail: Mail): Promise<boolean> {
  if (!emailConfigured()) {
    console.log(`[email:noop] would send "${mail.subject}" → ${mail.to}`);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: mail.to,
        subject: mail.subject,
        html: mail.html,
        ...(mail.text ? { text: mail.text } : {}),
      }),
    });
    if (!res.ok) {
      console.error("email send failed:", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (err) {
    console.error("email send error:", err);
    return false;
  }
}

/** Minimal, email-client-safe HTML shell around body content. */
export function emailLayout(title: string, bodyHtml: string, cta?: { label: string; url: string }): string {
  const button = cta
    ? `<p style="margin:24px 0"><a href="${cta.url}" style="background:#2563eb;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px;display:inline-block">${cta.label}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f6f6f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="background:#fff;border-radius:14px;padding:28px 24px">
      <h1 style="margin:0 0 12px;font-size:20px">${title}</h1>
      ${bodyHtml}
      ${button}
    </div>
    <p style="color:#888;font-size:12px;margin:16px 4px">Sent by your accessibility monitor.</p>
  </div></body></html>`;
}
