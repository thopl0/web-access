"use client";

// The one interactive bit of an otherwise-static pricing page: for a signed-in visitor on a paid
// tier's card, this button kicks off a Stripe Checkout Session via the startCheckout server action
// and redirects the browser to the hosted URL it returns. Everything else (logged-out, current-plan,
// billing-unavailable) is rendered as a plain link or a disabled button by the server page — this
// component is only mounted when an actual checkout is possible, with `disabled` as a belt-and-braces
// guard so we NEVER fire the action when it can't succeed.

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { startCheckout } from "@/app/actions/billing";

type Variant = "yellow" | "pink" | "blue" | "green" | "outline";

export function UpgradeButton({
  plan,
  label,
  variant = "blue",
  disabled = false,
}: {
  plan: "pro" | "business";
  label: string;
  variant?: Variant;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    // Guard: if billing is unavailable the button is already disabled, but never call the action.
    if (disabled || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await startCheckout(plan);
      if (result.ok) {
        // Hand off to Stripe's hosted checkout.
        window.location.href = result.url;
        return;
      }
      setError(result.message);
    });
  }

  return (
    <div>
      <Button
        type="button"
        variant={variant}
        size="lg"
        className="w-full"
        onClick={onClick}
        disabled={disabled || pending}
      >
        {pending ? "Redirecting…" : label}
      </Button>
      {error ? (
        <p role="alert" className="mt-2 text-sm font-bold text-pink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
