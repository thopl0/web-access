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

// Brand palette mirrored from the marketing site (app/globals.css) so emails feel like the homepage:
// warm-paper ground, ink-black borders/text, the yellow accent, and the neo-brutalist offset shadow.
const BRAND = {
  paper: "#fbf7f0", // --bg
  ink: "#16140f", // --ink (borders + text)
  inkSoft: "#4a4640", // --fg-soft (muted footer text)
  surface: "#ffffff", // card interior
  yellow: "#ffd23f", // primary accent (badge + button)
};
// Space Grotesk is the homepage display face; falls back to a system stack where webfonts are stripped.
const DISPLAY = "'Space Grotesk','Helvetica Neue',Arial,sans-serif";
const BODY = "Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Email-client-safe HTML shell styled to match the marketing site (neo-brutalist, warm paper). */
export function emailLayout(title: string, bodyHtml: string, cta?: { label: string; url: string }): string {
  // Table-wrapped button so the offset shadow + hard border survive across clients (degrades to a
  // bordered yellow block in Gmail, which strips box-shadow but keeps the brutalist look).
  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 4px">
        <tr><td style="background:${BRAND.yellow};border:3px solid ${BRAND.ink};box-shadow:5px 5px 0 ${BRAND.ink}">
          <a href="${cta.url}" style="display:inline-block;padding:14px 26px;color:${BRAND.ink};font-family:${DISPLAY};font-weight:700;font-size:16px;text-decoration:none">${cta.label} &rarr;</a>
        </td></tr></table>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Space+Grotesk:wght@500;700&display=swap');
    body{margin:0;padding:0;}
    a{color:#2d3dbf;}
    .em-body p{margin:0 0 14px;}
    .em-body ul{margin:6px 0 14px;padding-left:20px;}
    .em-body li{margin:0 0 6px;}
  </style>
</head>
<body style="margin:0;padding:0;background:${BRAND.paper};color:${BRAND.ink};font-family:${BODY};-webkit-text-size-adjust:100%">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.paper}">
    <tr><td align="center" style="padding:36px 16px 44px">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:100%">
        <tr><td style="padding:0 2px 22px">
          <span style="display:inline-block;background:${BRAND.yellow};border:3px solid ${BRAND.ink};box-shadow:4px 4px 0 ${BRAND.ink};color:${BRAND.ink};font-family:${DISPLAY};font-weight:700;font-size:13px;padding:7px 12px">webaccessibilitychecker.org</span>
        </td></tr>
        <tr><td style="background:${BRAND.surface};border:3px solid ${BRAND.ink};box-shadow:6px 6px 0 ${BRAND.ink};padding:32px 30px">
          <h1 style="margin:0 0 18px;font-family:${DISPLAY};font-weight:700;font-size:27px;line-height:1.15;color:${BRAND.ink}">${title}</h1>
          <div class="em-body" style="font-family:${BODY};font-size:16px;line-height:1.6;color:${BRAND.ink}">${bodyHtml}</div>
          ${button}
        </td></tr>
        <tr><td style="padding:22px 4px 0;color:${BRAND.inkSoft};font-family:${BODY};font-size:12px;line-height:1.5">
          Sent by <strong style="color:${BRAND.ink}">webaccessibilitychecker.org</strong> — your accessibility monitor.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
