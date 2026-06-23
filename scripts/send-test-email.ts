/**
 * One-off: send a single test email to confirm the marketing-styled `emailLayout()` renders well in
 * a real inbox. Run with `tsx scripts/send-test-email.ts <recipient>` (loads .env like the worker).
 * Uses the shared mailer, so it goes out over the configured Purelymail SMTP identity.
 */
import { config } from "dotenv";
config(); // load .env (cwd = repo root), same as the worker

import { sendEmail, emailLayout, emailConfigured } from "../lib/server/email";

async function main(): Promise<void> {
  const to = process.argv[2];
  if (!to) {
    console.error("usage: tsx scripts/send-test-email.ts <recipient-email>");
    process.exit(1);
  }
  if (!emailConfigured()) {
    console.error("email is not configured (no SMTP/Resend creds in .env) — would no-op.");
    process.exit(1);
  }

  const html = emailLayout(
    "Your emails just got a makeover",
    `<p>This is a test of the new email design — it now matches the look of ` +
      `<strong>webaccessibilitychecker.org</strong>: warm paper, hard ink borders, the yellow accent, ` +
      `and the offset shadow from the homepage.</p>` +
      `<p>A quick checklist of what you should see:</p>` +
      `<ul>` +
      `<li>The yellow brand badge up top</li>` +
      `<li>A bordered card with a chunky offset shadow</li>` +
      `<li>A bold display heading (Space Grotesk where supported)</li>` +
      `<li>A yellow call-to-action button below</li>` +
      `</ul>` +
      `<p>If that all looks right, the redesign is live.</p>`,
    { label: "Open your dashboard", url: "https://webaccessibilitychecker.org/dashboard" },
  );

  const ok = await sendEmail({
    to,
    category: "info",
    subject: "Test: new webaccessibilitychecker.org email design",
    html,
    text: "Test of the new email design. View this email in an HTML-capable client to see the new look.",
  });

  console.log(ok ? `✓ sent test email to ${to}` : `✗ send failed for ${to} (see error above)`);
  process.exit(ok ? 0 : 1);
}

void main();
