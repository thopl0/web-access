import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { env } from "@/lib/server/env";
import { getStripe, applySubscription } from "@/lib/server/billing";

// Stripe sends raw JSON we must verify against the signing secret, so we read the body as text and
// never let Next parse it. nodejs runtime (Stripe's SDK + crypto need it); never statically optimized.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Degrades gracefully: with no STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET the route 503s instead of
// crashing, so the app builds and runs unconfigured. When configured, it verifies the signature and
// updates the user's plan from subscription lifecycle events.
export async function POST(req: Request) {
  const stripe = getStripe();
  if (!stripe || !env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "billing_not_configured" }, { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing_signature" }, { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        // The subscription now exists; fetch + apply it so the plan flips the moment checkout lands
        // (rather than waiting for the subscription.created event, which may race the redirect).
        const session = event.data.object as Stripe.Checkout.Session;
        const subId =
          typeof session.subscription === "string"
            ? session.subscription
            : (session.subscription?.id ?? null);
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          await applySubscription(sub);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await applySubscription(event.data.object as Stripe.Subscription);
        break;
      }
      default:
        // Unhandled event types are fine — acknowledge so Stripe stops retrying.
        break;
    }
  } catch (err) {
    // Log and 500 so Stripe retries; never let a handler error swallow the event silently.
    console.error(`stripe webhook handler error (${event.type}):`, err);
    return NextResponse.json({ error: "handler_error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
