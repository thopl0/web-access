"use server";

// Server-action entry points for billing, following the codebase convention that anything a CLIENT
// component invokes lives in an `app/actions/*` file marked `"use server"` (see auth.ts, sites.ts).
// The actual Stripe logic lives in the server-only lib/server/billing.ts implementation module (also
// used by the webhook + the pricing page's plain server-side reads, which can't all be server
// actions); these are thin re-exports so client components import from a real action boundary.
import {
  startCheckout as startCheckoutImpl,
  openBillingPortal as openBillingPortalImpl,
  type BillingActionResult,
} from "@/lib/server/billing";
import { type Plan } from "@/lib/entitlements";

/** Begin Stripe Checkout for a paid plan; returns a hosted URL to redirect to (or a friendly error). */
export async function startCheckout(plan: Plan): Promise<BillingActionResult> {
  return startCheckoutImpl(plan);
}

/** Open the Stripe Billing Portal for the signed-in user; returns its URL (or a friendly error). */
export async function openBillingPortal(): Promise<BillingActionResult> {
  return openBillingPortalImpl();
}
