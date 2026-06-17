"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { CheckCircle } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import {
  updateProfile,
  changePassword,
  deleteAccount,
  type AccountFormState,
} from "@/app/actions/account";

/** Small success banner shown after a form action returns `{ ok: true }`. */
function SuccessNote({ id, children }: { id: string; children: string }) {
  return (
    <p
      id={id}
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-1.5 text-sm font-bold text-green"
    >
      <CheckCircle className="size-4 shrink-0" strokeWidth={2.75} aria-hidden="true" />
      {children}
    </p>
  );
}

/** Edit the display name. Prefilled from the server via `defaultName`. */
export function ProfileForm({ defaultName }: { defaultName: string }) {
  const uid = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<AccountFormState, FormData>(
    updateProfile,
    undefined,
  );

  return (
    <form ref={formRef} action={formAction} noValidate className="flex flex-col gap-5">
      <TextField
        id={`${uid}-name`}
        name="name"
        label="Name"
        type="text"
        autoComplete="name"
        hint="What should we call you?"
        defaultValue={defaultName}
        error={state?.errors?.name?.[0]}
      />

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" variant="blue" size="md" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        {state?.ok ? (
          <SuccessNote id={`${uid}-status`}>Profile updated.</SuccessNote>
        ) : null}
      </div>
    </form>
  );
}

/**
 * Change (or, for OAuth-only accounts, set) the password. `hasPassword` is false
 * for Google sign-ins that have never set one — in that case the current-password
 * field is optional and we show a hint explaining they can add email/password login.
 */
export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const uid = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<AccountFormState, FormData>(
    changePassword,
    undefined,
  );

  // Clear the inputs once the change lands so the old values don't linger.
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state?.ok]);

  return (
    <form ref={formRef} action={formAction} noValidate className="flex flex-col gap-5">
      {!hasPassword ? (
        <p className="text-sm text-fg-soft">
          This account signs in with Google. You can add a password to also sign in
          with your email.
        </p>
      ) : null}

      <TextField
        id={`${uid}-current`}
        name="currentPassword"
        label="Current password"
        type="password"
        required={hasPassword}
        autoComplete="current-password"
        error={state?.errors?.currentPassword?.[0]}
      />

      <TextField
        id={`${uid}-new`}
        name="newPassword"
        label="New password"
        type="password"
        required
        autoComplete="new-password"
        hint="At least 8 characters."
        error={state?.errors?.newPassword?.[0]}
      />

      <TextField
        id={`${uid}-confirm`}
        name="confirm"
        label="Confirm new password"
        type="password"
        required
        autoComplete="new-password"
        error={state?.errors?.confirm?.[0]}
      />

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" variant="blue" size="md" disabled={pending}>
          {pending
            ? hasPassword
              ? "Updating…"
              : "Setting password…"
            : hasPassword
              ? "Update password"
              : "Set password"}
        </Button>
        {state?.ok ? (
          <SuccessNote id={`${uid}-status`}>
            {hasPassword ? "Password updated." : "Password set."}
          </SuccessNote>
        ) : null}
      </div>
    </form>
  );
}

/**
 * Delete the account. Requires typing the account email to confirm; the button stays disabled
 * until it matches. On success the action signs out and redirects, so we only render errors here.
 */
export function DeleteAccountForm({ email }: { email: string }) {
  const uid = useId();
  const [confirm, setConfirm] = useState("");
  const [state, formAction, pending] = useActionState<AccountFormState, FormData>(
    deleteAccount,
    undefined,
  );

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor={`${uid}-confirm`} className="font-display font-bold text-fg">
          Type your email ({email}) to confirm
        </label>
        <input
          id={`${uid}-confirm`}
          name="confirm"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="off"
          aria-invalid={state?.errors?._form ? true : undefined}
          className="min-h-[44px] w-full border-[3px] border-[var(--color-line)] bg-surface px-4 py-3 text-base text-fg aria-[invalid=true]:border-pink"
        />
        {state?.errors?._form?.[0] ? (
          <p role="alert" className="text-sm font-bold text-pink">
            {state.errors._form[0]}
          </p>
        ) : null}
      </div>
      <div>
        <button
          type="submit"
          disabled={pending || confirm.trim().toLowerCase() !== email.toLowerCase()}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 border-[3px] border-[var(--ink)] bg-pink px-5 py-3 font-display font-bold text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Deleting…" : "Delete my account"}
        </button>
      </div>
    </form>
  );
}
