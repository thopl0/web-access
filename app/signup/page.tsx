import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/AuthShell";
import { AuthForm } from "@/components/auth/AuthForm";
import { AssistiveWaves } from "@/components/illustrations";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Sign up",
  description: `Create a ${SITE_NAME} account. Accounts aren't open yet — this is a preview of where sign-up will live.`,
};

/**
 * Placeholder signup page. No auth backend yet.
 *
 * TODO(auth): wire to NextAuth/Auth.js — the stubbed submit handler lives in
 * components/auth/AuthForm.tsx; replace it with a registration call (POST the
 * fields, then signIn the new user). The <SessionProvider> and the post-signup
 * redirect belong in app/layout.tsx, not on this page.
 */
export default function SignupPage() {
  return (
    <AuthShell
      titleId="signup-title"
      title="Make an account."
      intro={`Run your first scan and keep your reports in one place with ${SITE_NAME}.`}
      illustration={<AssistiveWaves className="w-full" />}
      footer={
        <p>
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-link underline underline-offset-2 font-bold"
          >
            Log in
          </Link>
        </p>
      }
    >
      <AuthForm mode="signup" />
    </AuthShell>
  );
}
