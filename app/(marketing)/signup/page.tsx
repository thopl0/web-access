import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/AuthShell";
import { AuthForm } from "@/components/auth/AuthForm";
import { GoogleSignIn } from "@/components/auth/GoogleSignIn";
import { AssistiveWaves } from "@/components/illustrations";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Sign up",
  description: `Create a ${SITE_NAME} account and run your first scan.`,
};

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
      <GoogleSignIn />
      <AuthForm mode="signup" />
    </AuthShell>
  );
}
