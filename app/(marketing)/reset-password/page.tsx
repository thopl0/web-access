import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/AuthShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Set a new password",
  description: `Choose a new password for your ${SITE_NAME} account.`,
  robots: { index: false },
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  // No token in the link → nothing to reset. Send them to request a fresh one.
  if (!token) {
    return (
      <AuthShell
        titleId="reset-title"
        title="Link not valid"
        intro="This password-reset link is missing or incomplete. Request a new one and we'll email it over."
        footer={
          <p>
            <Link href="/login" className="text-link underline underline-offset-2 font-bold">
              Back to log in
            </Link>
          </p>
        }
      >
        <Link
          href="/forgot-password"
          className="inline-flex min-h-[44px] w-full items-center justify-center border-[3px] border-[var(--ink)] bg-blue px-5 font-display font-bold text-on-accent shadow-ink"
        >
          Request a new link
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      titleId="reset-title"
      title="Set a new password"
      intro="Choose a new password for your account. Make it something you'll remember."
      footer={
        <p>
          <Link href="/login" className="text-link underline underline-offset-2 font-bold">
            Back to log in
          </Link>
        </p>
      }
    >
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}
