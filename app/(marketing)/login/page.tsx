import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/AuthShell";
import { AuthForm } from "@/components/auth/AuthForm";
import { GoogleSignIn } from "@/components/auth/GoogleSignIn";
import { KeyboardNav } from "@/components/illustrations";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Log in",
  description: `Sign in to your ${SITE_NAME} account.`,
};

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
      <GoogleSignIn />
      <AuthForm mode="login" />
    </AuthShell>
  );
}
