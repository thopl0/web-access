import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { LogOut } from "lucide-react";

import { ProfileForm, PasswordForm, DeleteAccountForm } from "@/components/dashboard/AccountForms";
import { BillingActions } from "@/components/dashboard/BillingActions";
import { BackLink, PageHeader, Panel } from "@/components/dashboard/ui";
import { getUser } from "@/lib/server/dal";
import { db, schema } from "@/lib/server/db";
import {
  entitlementsFor,
  isPaidPlan,
  normalizePlan,
  countUserSites,
  countUserPagesThisMonth,
} from "@/lib/server/entitlements";
import { billingConfigured, priceIdForPlan } from "@/lib/server/billing";
import { logout } from "@/app/actions/auth";

export const metadata: Metadata = { title: "Account" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await getUser();

  // One users-row read covers both the password gate and the plan/billing summary.
  // - hasPassword decides if the Password form requires the current one (true) or lets an
  //   OAuth-only user set their first (false).
  // - plan/planStatus/planRenewsAt drive the "Plan & billing" section below.
  const rows = await db
    .select({
      passwordHash: schema.users.passwordHash,
      plan: schema.users.plan,
      planStatus: schema.users.planStatus,
      planRenewsAt: schema.users.planRenewsAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, user!.id))
    .limit(1);
  const hasPassword = Boolean(rows[0]?.passwordHash);

  const plan = normalizePlan(rows[0]?.plan);
  const ent = entitlementsFor(plan);
  const planStatus = rows[0]?.planStatus ?? null;
  const planRenewsAt = rows[0]?.planRenewsAt ?? null;

  const [siteCount, pagesThisMonth] = await Promise.all([
    countUserSites(user!.id),
    countUserPagesThisMonth(user!.id),
  ]);

  const billingOn = billingConfigured();
  const paid = isPaidPlan(plan);

  const titleId = "account-title";

  return (
    <div aria-labelledby={titleId} className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8">
      <BackLink href="/dashboard">Back to dashboard</BackLink>

      <PageHeader
        className="mt-4"
        titleId={titleId}
        eyebrow="Settings"
        title="Account"
        lead="Manage your profile, password, and sessions."
      />

      <div className="mt-6 flex flex-col gap-6">
        <Panel as="section">
          <h2 className="font-display text-lg font-bold text-fg">Profile</h2>
          <dl className="mt-4">
            <dt className="font-display font-bold text-fg">Email</dt>
            <dd className="mt-1 text-fg-soft">{user!.email}</dd>
          </dl>
          <div className="mt-5">
            <ProfileForm defaultName={user!.name ?? ""} />
          </div>
        </Panel>

        <Panel as="section">
          <h2 className="font-display text-lg font-bold text-fg">Password</h2>
          <div className="mt-5">
            <PasswordForm hasPassword={hasPassword} />
          </div>
        </Panel>

        <Panel as="section">
          <h2 className="font-display text-lg font-bold text-fg">Sessions</h2>
          <p className="mt-1 text-sm text-fg-soft">Sign out of this device.</p>
          <form action={logout} className="mt-4">
            <button
              type="submit"
              className="inline-flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-bold text-fg-soft transition-colors hover:bg-[color-mix(in_srgb,var(--color-fg)_5%,transparent)] hover:text-fg"
            >
              <LogOut className="size-4" strokeWidth={2.25} aria-hidden />
              Log out
            </button>
          </form>
        </Panel>

        <Panel as="section">
          <h2 className="font-display text-lg font-bold text-fg">Plan &amp; billing</h2>
          <dl className="mt-4 flex flex-col gap-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <dt className="font-display font-bold text-fg">{ent.label}</dt>
              <dd className="text-fg-soft">{planStatus ?? "—"}</dd>
            </div>
            {planRenewsAt ? (
              <dd className="text-sm text-fg-soft">
                Renews {planRenewsAt.toLocaleDateString()}
              </dd>
            ) : null}
          </dl>
          <p className="mt-3 text-sm text-fg-soft">
            {siteCount} / {ent.maxSites} sites · {pagesThisMonth} / {ent.pagesPerMonth} pages this
            month
          </p>
          <BillingActions
            currentPlan={plan}
            isPaid={paid}
            billingConfigured={billingOn}
            proAvailable={priceIdForPlan("pro") != null}
            businessAvailable={priceIdForPlan("business") != null}
          />
        </Panel>

        <section className="rounded-[14px] border-[3px] border-pink/40 p-5 sm:p-6">
          <h2 className="font-display text-lg font-bold text-pink">Danger zone</h2>
          <p className="mt-1 mb-5 text-sm text-fg-soft">
            Deleting your account permanently removes it along with every site, scan, and issue you
            own. This can&apos;t be undone.
          </p>
          <DeleteAccountForm email={user!.email} />
        </section>
      </div>
    </div>
  );
}
