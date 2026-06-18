import "server-only";

// Stripe billing layer. Mirrors the email (RESEND_API_KEY) and AI-judge (GLM_API_KEY) resilience
// pattern: EVERYTHING is gated on STRIPE_SECRET_KEY. When it's unset, getStripe() returns null and
// every action below no-ops with a friendly result instead of throwing — the app builds, runs, and
// every non-billing feature works with zero Stripe config. The webhook (separate route) verifies and
// applies subscription changes; this module owns the client + the customer/checkout/portal flows.
import Stripe from "stripe";
import { eq } from "drizzle-orm";

import { db, schema } from "./db";
import { env } from "./env";
import { verifySession } from "./dal";
import { appOrigin } from "./origin";
import { type Plan, normalizePlan } from "@/lib/entitlements";

/** True when Stripe is configured (a secret key is present). The single switch for the billing layer. */
export function billingConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

// One client per process, lazily created. Cached on globalThis so `next dev` HMR reuses it (same
// reasoning as lib/server/db.ts). Returns null when unconfigured so callers branch instead of crash.
const globalForStripe = globalThis as unknown as { __waStripe?: Stripe };

/** The configured Stripe client, or null when STRIPE_SECRET_KEY is unset. */
export function getStripe(): Stripe | null {
  if (!env.STRIPE_SECRET_KEY) return null;
  if (!globalForStripe.__waStripe) {
    // No apiVersion override — use the SDK's pinned default so types stay in lockstep with the lib.
    globalForStripe.__waStripe = new Stripe(env.STRIPE_SECRET_KEY, {
      appInfo: { name: "web-access" },
    });
  }
  return globalForStripe.__waStripe;
}

/** Map a paid plan → its configured Stripe price id (or null when that price env isn't set). */
export function priceIdForPlan(plan: Plan): string | null {
  if (plan === "pro") return env.STRIPE_PRICE_PRO ?? null;
  if (plan === "business") return env.STRIPE_PRICE_BUSINESS ?? null;
  return null; // free has no price
}

/** Reverse of priceIdForPlan: resolve a Stripe price id back to one of our plans (webhook uses this). */
export function planForPriceId(priceId: string | null | undefined): Plan | null {
  if (!priceId) return null;
  if (priceId === env.STRIPE_PRICE_PRO) return "pro";
  if (priceId === env.STRIPE_PRICE_BUSINESS) return "business";
  return null;
}

/** Result shape shared by the checkout / portal actions: a redirect URL, or a friendly error. */
export type BillingActionResult = { ok: true; url: string } | { ok: false; message: string };

/** Load the signed-in user's email + existing Stripe customer id. */
async function loadBillingUser(userId: string) {
  const rows = await db
    .select({
      email: schema.users.email,
      stripeCustomerId: schema.users.stripeCustomerId,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Create or reuse the Stripe customer for a user, persisting the id back on the row so we only ever
 * create one customer per account. Caller has already null-checked the client.
 */
async function ensureCustomer(
  stripe: Stripe,
  userId: string,
  email: string,
  existingId: string | null,
): Promise<string> {
  if (existingId) return existingId;
  const customer = await stripe.customers.create({
    email,
    metadata: { userId },
  });
  await db
    .update(schema.users)
    .set({ stripeCustomerId: customer.id })
    .where(eq(schema.users.id, userId));
  return customer.id;
}

/**
 * Server action: start a Checkout Session for a paid plan and return its hosted URL. The client
 * redirects to it. No-ops gracefully when Stripe is unconfigured or the plan's price id is missing.
 */
export async function startCheckout(plan: Plan): Promise<BillingActionResult> {
  const { userId } = await verifySession();

  const stripe = getStripe();
  if (!stripe) return { ok: false, message: "Billing isn't configured yet." };

  const normalized = normalizePlan(plan);
  const priceId = priceIdForPlan(normalized);
  if (!priceId) return { ok: false, message: "That plan isn't available for purchase yet." };

  const user = await loadBillingUser(userId);
  if (!user) return { ok: false, message: "Account not found." };

  try {
    const customerId = await ensureCustomer(stripe, userId, user.email, user.stripeCustomerId);
    const origin = await appOrigin();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      // Stamp the chosen plan + user so the webhook can resolve them even before the subscription
      // expands its line items.
      client_reference_id: userId,
      subscription_data: { metadata: { userId, plan: normalized } },
      success_url: `${origin}/dashboard/account?billing=success`,
      cancel_url: `${origin}/dashboard/account?billing=cancelled`,
      allow_promotion_codes: true,
    });
    if (!session.url) return { ok: false, message: "Couldn't start checkout — try again." };
    return { ok: true, url: session.url };
  } catch (err) {
    console.error("stripe checkout error:", err);
    return { ok: false, message: "Couldn't start checkout — try again." };
  }
}

/**
 * Server action: open the Stripe Billing Portal so a paid user can manage / cancel their subscription.
 * No-ops when Stripe is unconfigured or the user has no Stripe customer (i.e. never paid).
 */
export async function openBillingPortal(): Promise<BillingActionResult> {
  const { userId } = await verifySession();

  const stripe = getStripe();
  if (!stripe) return { ok: false, message: "Billing isn't configured yet." };

  const user = await loadBillingUser(userId);
  if (!user?.stripeCustomerId) {
    return { ok: false, message: "No billing account yet — upgrade to a paid plan first." };
  }

  try {
    const origin = await appOrigin();
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${origin}/dashboard/account`,
    });
    return { ok: true, url: session.url };
  } catch (err) {
    console.error("stripe billing portal error:", err);
    return { ok: false, message: "Couldn't open the billing portal — try again." };
  }
}

/**
 * Apply a subscription's current state to the owning user: plan (from its price), status, id, and
 * renewal date. Called by the webhook for created/updated/deleted events. Resolves the user by the
 * subscription's metadata.userId first, falling back to the Stripe customer id. Best-effort: a row we
 * can't resolve is logged and skipped (never throws, so the webhook still 200s).
 */
export async function applySubscription(sub: Stripe.Subscription): Promise<void> {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const metaUserId = (sub.metadata?.userId as string | undefined) ?? null;

  // Resolve the owning user.
  let userId = metaUserId;
  if (!userId) {
    const rows = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.stripeCustomerId, customerId))
      .limit(1);
    userId = rows[0]?.id ?? null;
  }
  if (!userId) {
    console.error(`[billing] subscription ${sub.id} — no matching user (customer ${customerId})`);
    return;
  }

  // Deleted/canceled subscriptions drop the user back to free; otherwise derive the plan from the
  // subscription's price (metadata.plan is a hint but the price id is authoritative).
  const status = sub.status;
  const ended = status === "canceled" || status === "incomplete_expired";
  const priceId = sub.items.data[0]?.price?.id ?? null;
  const plan: Plan = ended
    ? "free"
    : (planForPriceId(priceId) ?? normalizePlan(sub.metadata?.plan));

  // The current period end is on the subscription item (Stripe moved it off the top level in recent
  // API versions). Fall back across both shapes so this is robust to version drift.
  const periodEnd =
    sub.items.data[0]?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    null;

  await db
    .update(schema.users)
    .set({
      plan,
      planStatus: ended ? "canceled" : status,
      stripeCustomerId: customerId,
      stripeSubscriptionId: ended ? null : sub.id,
      planRenewsAt: ended || !periodEnd ? null : new Date(periodEnd * 1000),
    })
    .where(eq(schema.users.id, userId));
}
