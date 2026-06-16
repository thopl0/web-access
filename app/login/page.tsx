import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/AuthShell";
import { AuthForm } from "@/components/auth/AuthForm";
import { KeyboardNav } from "@/components/illustrations";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Log in",
  description: `Sign in to ${SITE_NAME}. Accounts aren't open yet — this is a preview of where logging in will live.`,
};

/**
 * Placeholder login page. No auth backend yet.
 *
 * TODO(auth): wire to NextAuth/Auth.js — the stubbed submit handler lives in
 * components/auth/AuthForm.tsx; replace it with signIn(). The <SessionProvider>
 * and any post-login redirect belong in app/layout.tsx, not on this page.
 */
export default function LoginPage() {
  return (
    <AuthShell
      titleId="login-title"
      title="Welcome back."
      intro={`Pick up where you left off with ${SITE_NAME}.`}
      illustration={<KeyboardNav className="w-full" />}
      footer={
        <p>
          New here?{" "}
          <Link
            href="/signup"
            className="text-link underline underline-offset-2 font-bold"
          >
            Create an account
          </Link>
        </p>
      }
    >
      <AuthForm mode="login" />
    </AuthShell>
  );
}
