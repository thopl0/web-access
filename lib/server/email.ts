// Provider-agnostic email layer. Prefers SMTP (e.g. Purelymail) when configured, falls back to the
// Resend HTTP API, and otherwise no-ops (logs the intended send) so the app runs fine without email
// set up. Every send picks a "From" identity by CATEGORY (alerts / info / marketing / contact), so the
// four mailboxes are addressed consistently from one place.
// NOT `import "server-only"` — shared with the BullMQ worker (digests / critical alerts).
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "./env";

/** Which sender identity a message goes out as. */
export type EmailCategory = "alerts" | "info" | "marketing" | "contact";

export type Mail = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Sender identity → "From" address. Defaults to "info". */
  category?: EmailCategory;
  /** Reply-To override (e.g. the contact-form visitor's address). */
  replyTo?: string;
};

/** The mailbox (and SMTP login) for each category — each identity sends as itself. */
const FROM_ADDRESS: Record<EmailCategory, string> = {
  alerts: env.EMAIL_FROM_ALERTS,
  info: env.EMAIL_FROM_INFO,
  marketing: env.EMAIL_FROM_MARKETING,
  contact: env.EMAIL_FROM_CONTACT,
};

const CATEGORIES: EmailCategory[] = ["alerts", "info", "marketing", "contact"];

/** Password each mailbox authenticates with: its own if set, else the shared Purelymail password. */
const PASSWORD_FOR: Record<EmailCategory, string | undefined> = {
  alerts: env.SMTP_PASSWORD_ALERTS ?? env.SMTP_PASSWORD,
  info: env.SMTP_PASSWORD_INFO ?? env.SMTP_PASSWORD,
  marketing: env.SMTP_PASSWORD_MARKETING ?? env.SMTP_PASSWORD,
  contact: env.SMTP_PASSWORD_CONTACT ?? env.SMTP_PASSWORD,
};

/** "Web Accessibility Checker <alerts@…>" — a friendly From for the given category. */
function fromHeader(category: EmailCategory): string {
  const addr = FROM_ADDRESS[category];
  return env.EMAIL_FROM_NAME ? `${env.EMAIL_FROM_NAME} <${addr}>` : addr;
}

/** SMTP is usable for a category when the host and that mailbox's password are both present. */
function smtpConfigured(category: EmailCategory): boolean {
  return Boolean(env.SMTP_HOST && PASSWORD_FOR[category]);
}
function resendConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
}
export function emailConfigured(): boolean {
  const anySmtp = Boolean(env.SMTP_HOST) && CATEGORIES.some((c) => PASSWORD_FOR[c]);
  return anySmtp || resendConfigured();
}

// One SMTP connection pool per identity, created lazily — each authenticates as its own mailbox.
const transporters = new Map<EmailCategory, Transporter>();
function getTransport(category: EmailCategory): Transporter {
  let t = transporters.get(category);
  if (!t) {
    t = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465, // implicit TLS on 465; STARTTLS on 587
      auth: { user: FROM_ADDRESS[category], pass: PASSWORD_FOR[category] },
    });
    transporters.set(category, t);
  }
  return t;
}

export async function sendEmail(mail: Mail): Promise<boolean> {
  const category = mail.category ?? "info";
  const from = fromHeader(category);

  if (smtpConfigured(category)) {
    try {
      await getTransport(category).sendMail({
        from,
        to: mail.to,
        subject: mail.subject,
        html: mail.html,
        ...(mail.text ? { text: mail.text } : {}),
        ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
      });
      return true;
    } catch (err) {
      console.error(`email send error (smtp, ${category}):`, err);
      return false;
    }
  }

  if (resendConfigured()) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.RESEND_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: mail.to,
          subject: mail.subject,
          html: mail.html,
          ...(mail.text ? { text: mail.text } : {}),
          ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
        }),
      });
      if (!res.ok) {
        console.error("email send failed (resend):", res.status, await res.text().catch(() => ""));
        return false;
      }
      return true;
    } catch (err) {
      console.error("email send error (resend):", err);
      return false;
    }
  }

  console.log(`[email:noop] would send "${mail.subject}" → ${mail.to} (from ${from})`);
  return false;
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
