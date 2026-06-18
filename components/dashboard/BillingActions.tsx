"use client";

import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { startCheckout, openBillingPortal } from "@/app/actions/billing";
import { type Plan } from "@/lib/entitlements";

/**
 * Account billing actions: upgrade-to-paid (Stripe Checkout) and manage-billing (Stripe Billing
 * Portal). Every path is guarded — when Stripe isn't configured we render a muted note instead of
 * buttons that can't work, so the section degrades gracefully on deployments with no Stripe keys.
 * The current plan label/status is rendered by the page; this component owns only the actions.
 */
export function BillingActions({
  currentPlan,
  isPaid,
  billingConfigured,
  proAvailable,
  businessAvailable,
}: {
  currentPlan: Plan;
  isPaid: boolean;
  billingConfigured: boolean;
  proAvailable: boolean;
  businessAvailable: boolean;
}) {
  const errorId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Run a billing action and either redirect to its hosted URL or surface the friendly error.
  function run(action: () => Promise<{ ok: true; url: string } | { ok: false; message: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        window.location.href = result.url;
      } else {
        setError(result.message);
      }
    });
  }

  // The paid plans the user isn't already on, paired with whether each is purchasable right now.
  const upgrades = (
    [
      { plan: "pro", label: "Pro", available: proAvailable },
      { plan: "business", label: "Business", available: businessAvailable },
    ] satisfies Array<{ plan: Plan; label: string; available: boolean }>
  ).filter((u) => u.plan !== currentPlan);

  return (
    <div className="mt-5 flex flex-col gap-4">
      {billingConfigured ? (
        <div className="flex flex-wrap items-center gap-4">
          {upgrades
            .filter((u) => u.available)
            .map((u) => (
              <Button
                key={u.plan}
                type="button"
                variant="blue"
                size="md"
                disabled={pending}
                onClick={() => run(() => startCheckout(u.plan))}
              >
                {pending ? "Redirecting…" : `Upgrade to ${u.label}`}
              </Button>
            ))}

          {isPaid ? (
            <Button
              type="button"
              variant="outline"
              size="md"
              disabled={pending}
              onClick={() => run(() => openBillingPortal())}
            >
              {pending ? "Redirecting…" : "Manage billing"}
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-fg-soft">Billing isn&apos;t set up on this deployment yet.</p>
      )}

      <div id={errorId} role="alert" aria-live="polite">
        {error ? <p className="text-sm font-bold text-pink">{error}</p> : null}
      </div>
    </div>
  );
}
