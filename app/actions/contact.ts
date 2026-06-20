"use server";

import { z } from "zod";

import { env } from "@/lib/server/env";
import { sendEmail, emailLayout, emailConfigured } from "@/lib/server/email";

export type ContactState = { ok?: boolean; error?: string } | undefined;

const ContactSchema = z.object({
  name: z.string().trim().min(1, "name").max(120),
  email: z.string().trim().email(),
  topic: z.string().trim().max(40).optional(),
  message: z.string().trim().min(1, "message").max(5000),
});

/** Escape user input before it goes into the notification HTML. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Contact-form submission → an email to the contact inbox, sent from the `contact@` identity with the
 * visitor's address as Reply-To (so a reply goes straight back to them). Validates, drops obvious bots
 * via a honeypot, and never reveals internal detail in the returned error.
 */
export async function submitContact(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  // Honeypot: a hidden field real users never fill. If it has a value, accept silently (don't email).
  if (String(formData.get("company") ?? "").trim()) return { ok: true };

  const parsed = ContactSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    topic: formData.get("topic") || undefined,
    message: formData.get("message"),
  });
  if (!parsed.success) {
    return { error: "Please fill in your name, a valid email, and a message." };
  }
  const { name, email, topic, message } = parsed.data;

  if (!emailConfigured()) {
    console.error("[contact] email not configured — dropping submission");
    return { error: "Messaging isn't available right now. Please try again later." };
  }

  const ok = await sendEmail({
    to: env.CONTACT_INBOX,
    category: "contact",
    replyTo: email,
    subject: `Contact form${topic ? ` · ${topic}` : ""} — ${name}`,
    html: emailLayout(
      "New contact message",
      `<p><strong>From:</strong> ${esc(name)} &lt;${esc(email)}&gt;</p>` +
        `<p><strong>Topic:</strong> ${esc(topic ?? "—")}</p>` +
        `<p style="white-space:pre-wrap">${esc(message)}</p>`,
    ),
    text: `From: ${name} <${email}>\nTopic: ${topic ?? "—"}\n\n${message}`,
  });

  if (!ok) {
    return { error: "Something went wrong sending your message. Please try again in a moment." };
  }
  return { ok: true };
}
