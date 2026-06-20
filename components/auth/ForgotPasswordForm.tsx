"use client";

import { useActionState, useId } from "react";
import { MailCheck } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { requestPasswordReset, type RequestResetState } from "@/app/actions/password-reset";

/**
 * "Forgot password" — step 1. Collects an email and asks the server to send a reset link. The success
 * state is deliberately generic ("if an account exists…") so the page never reveals whether an address
 * is registered.
 */
export function ForgotPasswordForm() {
  const uid = useId();
  const [state, formAction, pending] = useActionState<RequestResetState, FormData>(
    requestPasswordReset,
    undefined,
  );

  if (state?.ok) {
    return (
      <div role="status" aria-live="polite" className="flex flex-col items-start gap-4">
        <span className="inline-flex size-12 items-center justify-center border-[3px] border-[var(--ink)] bg-green text-on-accent shadow-ink">
          <MailCheck className="size-6" strokeWidth={2.5} aria-hidden="true" />
        </span>
        <p className="text-fg">
          If an account exists for that email, we&apos;ve sent a link to reset your password. It works
          once and expires in an hour — check your inbox (and your spam folder).
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      <TextField
        id={`${uid}-email`}
        name="email"
        label="Email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        hint="We'll email a link to set a new password."
        error={state?.error}
      />

      <Button type="submit" variant="blue" size="lg" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
