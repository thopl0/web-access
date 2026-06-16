"use client";

import { useId, useRef, useState } from "react";
import { Info } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";

type Mode = "login" | "signup";

/**
 * Placeholder auth form shared by /login and /signup. There is NO auth backend
 * yet — this collects the right fields with correct labels/autocomplete and,
 * on submit, tells the visitor honestly that accounts aren't live.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TODO(auth): wire to NextAuth/Auth.js — replace this stubbed handler with
 * signIn()/registration call.
 *
 * When real auth lands:
 *   - login:  call `signIn("credentials", { email, password, redirectTo })`
 *             (or your provider) instead of the stub below.
 *   - signup: POST { name, email, password } to the registration endpoint,
 *             then sign the new user in.
 *   - On success, redirect to the post-auth destination (e.g. router.push("/")
 *             or rely on Auth.js `redirectTo`). The <SessionProvider> for client
 *             session access belongs in app/layout.tsx (or a providers wrapper),
 *             NOT here.
 *   - Surface real server errors via the same inline status region below
 *             (swap role="status" for role="alert" on actual failures).
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function AuthForm({ mode }: { mode: Mode }) {
  const uid = useId();
  const fieldId = (name: string) => `${uid}-${name}`;
  const statusId = `${uid}-status`;

  const [submitted, setSubmitted] = useState(false);
  const statusRef = useRef<HTMLParagraphElement>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    // No backend yet: never actually submit. Keep the page honest.
    event.preventDefault();

    // TODO(auth): replace everything below with the real signIn()/register call.
    setSubmitted(true);
    requestAnimationFrame(() => statusRef.current?.focus());
  }

  const isSignup = mode === "signup";

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {isSignup ? (
        <TextField
          id={fieldId("name")}
          name="name"
          label="Name"
          type="text"
          autoComplete="name"
          hint="What should we call you?"
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
      />

      <TextField
        id={fieldId("password")}
        name="password"
        label="Password"
        type="password"
        required
        autoComplete={isSignup ? "new-password" : "current-password"}
      />

      {!isSignup ? (
        // TODO(auth): make this a real <Link> to the password-reset flow once
        // accounts exist. Until then it's plain text, not a dead/disabled link
        // that traps keyboard focus and goes nowhere.
        <p className="-mt-1 text-sm text-fg-soft">
          Password resets arrive with accounts.
        </p>
      ) : null}

      <Button type="submit" variant="blue" size="lg" className="w-full">
        {isSignup ? "Create account" : "Log in"}
      </Button>

      {/* Inline, honest status. Announced politely; focusable so keyboard and
          screen-reader users land on it after the stubbed submit. */}
      <p
        id={statusId}
        ref={statusRef}
        role="status"
        tabIndex={-1}
        className="min-h-[1.5rem] text-sm font-bold text-fg outline-none focus-visible:outline-3 focus-visible:outline-[var(--color-blue)] focus-visible:outline-offset-2"
      >
        {submitted ? (
          <span className="inline-flex items-center gap-1.5">
            <Info className="size-4 shrink-0" strokeWidth={2.75} aria-hidden="true" />
            Accounts aren&apos;t live yet — nothing was sent. Hang tight.
          </span>
        ) : null}
      </p>
    </form>
  );
}
