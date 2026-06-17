"use client";

import { useActionState, useId } from "react";
import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { login, signup, type AuthFormState } from "@/app/actions/auth";

type Mode = "login" | "signup";

/**
 * Auth form shared by /login and /signup. Wired to the real Server Actions in
 * app/actions/auth.ts via useActionState: on success the action redirects to
 * /dashboard; on failure it returns field/_form errors surfaced inline below
 * (the TextField component handles per-field role="alert" + aria-invalid).
 */
export function AuthForm({ mode }: { mode: Mode }) {
  const uid = useId();
  const fieldId = (name: string) => `${uid}-${name}`;
  const statusId = `${uid}-status`;

  const isSignup = mode === "signup";
  const action = isSignup ? signup : login;
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    action,
    undefined,
  );

  const formError = state?.errors?._form?.[0];

  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      {isSignup ? (
        <TextField
          id={fieldId("name")}
          name="name"
          label="Name"
          type="text"
          autoComplete="name"
          hint="What should we call you?"
          error={state?.errors?.name?.[0]}
        />
      ) : null}

      <TextField
        id={fieldId("email")}
        name="email"
        label="Email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        error={state?.errors?.email?.[0]}
      />

      <TextField
        id={fieldId("password")}
        name="password"
        label="Password"
        type="password"
        required
        autoComplete={isSignup ? "new-password" : "current-password"}
        hint={isSignup ? "At least 8 characters." : undefined}
        error={state?.errors?.password?.[0]}
      />

      {!isSignup ? (
        // TODO(auth): wire to a real password-reset flow when it exists. Until
        // then it's plain text, not a dead link that traps keyboard focus.
        <p className="-mt-1 text-sm text-fg-soft">
          Forgot your password? Reset is coming soon.
        </p>
      ) : null}

      <Button type="submit" variant="blue" size="lg" className="w-full" disabled={pending}>
        {pending
          ? isSignup
            ? "Creating account…"
            : "Logging in…"
          : isSignup
            ? "Create account"
            : "Log in"}
      </Button>

      {/* Form-level error (e.g. wrong credentials). Announced assertively. */}
      <p
        id={statusId}
        role="alert"
        aria-live="assertive"
        className="min-h-[1.5rem] text-sm font-bold text-pink"
      >
        {formError ? (
          <span className="inline-flex items-center gap-1.5">
            <AlertCircle className="size-4 shrink-0" strokeWidth={2.75} aria-hidden="true" />
            {formError}
          </span>
        ) : null}
      </p>
    </form>
  );
}
