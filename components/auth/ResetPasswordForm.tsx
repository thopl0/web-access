"use client";

import { useActionState, useId } from "react";
import Link from "next/link";
import { AlertCircle, CircleCheck } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { resetPassword, type ResetState } from "@/app/actions/password-reset";

/**
 * "Forgot password" — step 2. Sets a new password using the one-time token from the email link (passed
 * in from the page's query string and submitted as a hidden field). On success it points the user to
 * the login page; on an invalid/expired token it surfaces a clear error with a way to start over.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const uid = useId();
  const [state, formAction, pending] = useActionState<ResetState, FormData>(
    resetPassword,
    undefined,
  );

  if (state?.ok) {
    return (
      <div role="status" aria-live="polite" className="flex flex-col items-start gap-4">
        <span className="inline-flex size-12 items-center justify-center border-[3px] border-[var(--ink)] bg-green text-on-accent shadow-ink">
          <CircleCheck className="size-6" strokeWidth={2.5} aria-hidden="true" />
        </span>
        <p className="text-fg">Your password is updated. You can log in with it now.</p>
        <Button href="/login" variant="blue" size="lg" className="w-full">
          Go to log in
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="token" value={token} />

      <TextField
        id={`${uid}-password`}
        name="password"
        label="New password"
        type="password"
        required
        autoComplete="new-password"
        hint="At least 8 characters."
      />
      <TextField
        id={`${uid}-confirm`}
        name="confirm"
        label="Confirm new password"
        type="password"
        required
        autoComplete="new-password"
      />

      <Button type="submit" variant="blue" size="lg" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Set new password"}
      </Button>

      {state?.error ? (
        <p role="alert" aria-live="assertive" className="text-sm font-bold text-pink">
          <span className="inline-flex items-center gap-1.5">
            <AlertCircle className="size-4 shrink-0" strokeWidth={2.75} aria-hidden="true" />
            {state.error}
          </span>{" "}
          <Link href="/forgot-password" className="text-link underline underline-offset-2">
            Request a new link
          </Link>
        </p>
      ) : null}
    </form>
  );
}
