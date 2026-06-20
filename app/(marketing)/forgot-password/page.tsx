import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Forgot password",
  description: `Reset the password for your ${SITE_NAME} account.`,
  robots: { index: false },
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      titleId="forgot-title"
      title="Reset your password"
      intro="Enter your account email and we'll send you a link to set a new password."
      footer={
        <p>
          Remembered it?{" "}
          <Link href="/login" className="text-link underline underline-offset-2 font-bold">
            Back to log in
          </Link>
        </p>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
