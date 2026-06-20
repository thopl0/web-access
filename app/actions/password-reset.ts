"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/lib/server/db";
import { env } from "@/lib/server/env";
import { hashPassword } from "@/lib/server/password";
import { createPasswordReset, consumePasswordReset } from "@/lib/server/password-reset";
import { sendEmail, emailLayout } from "@/lib/server/email";
import { SITE_NAME } from "@/lib/site";

export type RequestResetState = { ok?: boolean; error?: string } | undefined;
export type ResetState = { ok?: boolean; error?: string } | undefined;

const EmailSchema = z.object({
  email: z.string().trim().toLowerCase().email({ message: "Enter a valid email address." }),
});

/**
 * Step 1: "I forgot my password." Looks up the account and, if it exists, emails a one-time reset
 * link from the info@ identity. ALWAYS returns the same success — we never reveal whether an email is
 * registered (anti-enumeration). We only ever email an address that has an account, so this can't be
 * abused to spray mail at arbitrary inboxes.
 */
export async function requestPasswordReset(
  _prev: RequestResetState,
  formData: FormData,
): Promise<RequestResetState> {
  const parsed = EmailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors.email?.[0] ?? "Enter a valid email address." };
  }
  const { email } = parsed.data;

  const found = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  const user = found[0];

  if (user && env.APP_ORIGIN) {
    const raw = await createPasswordReset(user.id); // null when within the resend cooldown
    if (raw) {
      const url = `${env.APP_ORIGIN.replace(/\/+$/, "")}/reset-password?token=${encodeURIComponent(raw)}`;
      await sendEmail({
        to: email,
        category: "info",
        subject: "Reset your password",
        html: emailLayout(
          "Reset your password",
          `<p>We got a request to reset the password for your ${SITE_NAME} account. Choose a new one with the button below. This link works once and expires in 1 hour.</p>` +
            `<p>If you didn't ask for this, just ignore this email — your password won't change.</p>`,
          { label: "Reset password", url },
        ),
        text:
          `Reset your ${SITE_NAME} password: ${url}\n\n` +
          `This link works once and expires in 1 hour. If you didn't request it, ignore this email.`,
      });
    }
  }

  // Same response whether or not the account exists.
  return { ok: true };
}

const ResetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, { message: "Use at least 8 characters." }),
});

/**
 * Step 2: set the new password from the emailed link. Consumes the token (single-use), updates the
 * hash, and reports a clear error when the link is invalid/expired so the user can request a fresh one.
 */
export async function resetPassword(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const parsed = ResetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors.password?.[0] ?? "Check the form and try again." };
  }
  if (parsed.data.password !== String(formData.get("confirm") ?? "")) {
    return { error: "The two passwords don't match." };
  }

  const userId = await consumePasswordReset(parsed.data.token);
  if (!userId) {
    return { error: "This reset link is invalid or has expired. Request a new one." };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await db.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, userId));
  return { ok: true };
}
