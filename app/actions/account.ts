"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { signOut } from "@/auth";
import { db, schema } from "@/lib/server/db";
import { verifySession } from "@/lib/server/dal";
import { hashPassword, verifyPassword } from "@/lib/server/password";

/** Shared shape for the account forms. Field keys line up with the form inputs;
 *  `_form` holds errors not tied to a single field. `ok` flips the success UI. */
export type AccountFormState =
  | {
      errors?: {
        name?: string[];
        currentPassword?: string[];
        newPassword?: string[];
        confirm?: string[];
        _form?: string[];
      };
      ok?: boolean;
    }
  | undefined;

const ProfileSchema = z.object({
  // Name is optional — an empty value clears it (back to a null display name).
  name: z.string().trim().max(120).optional(),
});

export async function updateProfile(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  // Authoritative auth check inside the action (proxy is only optimistic).
  const { userId } = await verifySession();

  const parsed = ProfileSchema.safeParse({
    name: formData.get("name") || undefined,
  });
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  await db
    .update(schema.users)
    .set({ name: parsed.data.name ?? null })
    .where(eq(schema.users.id, userId));

  revalidatePath("/dashboard/account");
  // The sidebar greets the user by name, so refresh the dashboard too.
  revalidatePath("/dashboard");
  return { ok: true };
}

const PasswordSchema = z
  .object({
    currentPassword: z.string().optional(),
    newPassword: z.string().min(8, { message: "Use at least 8 characters." }),
    confirm: z.string(),
  })
  .refine((data) => data.newPassword === data.confirm, {
    message: "Passwords don't match.",
    path: ["confirm"],
  });

export async function changePassword(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const { userId } = await verifySession();

  const parsed = PasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword") || undefined,
    newPassword: formData.get("newPassword"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const rows = await db
    .select({ passwordHash: schema.users.passwordHash })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  const user = rows[0];
  if (!user) {
    return { errors: { _form: ["Account not found."] } };
  }

  const { currentPassword, newPassword } = parsed.data;

  // If the account already has a password, the current one must check out before
  // we let it change. OAuth-only accounts (null hash) can SET a first password
  // without one, so Google users can add email/password login.
  if (user.passwordHash) {
    if (!currentPassword || !(await verifyPassword(currentPassword, user.passwordHash))) {
      return { errors: { currentPassword: ["Incorrect password."] } };
    }
  }

  const passwordHash = await hashPassword(newPassword);
  await db
    .update(schema.users)
    .set({ passwordHash })
    .where(eq(schema.users.id, userId));

  return { ok: true };
}

/**
 * Permanently delete the account and everything under it. Requires typing the account email to
 * confirm. Sites cascade-delete with the user (and their issueOverrides cascade with the sites), but
 * scans aren't FK-linked to sites — so we delete the user's sites' scans first (cascading findings →
 * evidence / explanations). On success signOut throws a redirect to "/", which must propagate.
 */
export async function deleteAccount(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const { userId } = await verifySession();

  const rows = await db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  const user = rows[0];
  if (!user) return { errors: { _form: ["Account not found."] } };

  const confirm = String(formData.get("confirm") ?? "").trim().toLowerCase();
  if (confirm !== user.email.toLowerCase()) {
    return { errors: { _form: ["Type your account email exactly to confirm."] } };
  }

  const siteRows = await db
    .select({ id: schema.sites.id })
    .from(schema.sites)
    .where(eq(schema.sites.ownerId, userId));
  const siteIds = siteRows.map((s) => s.id);
  if (siteIds.length > 0) {
    await db.delete(schema.scans).where(inArray(schema.scans.siteId, siteIds));
  }
  await db.delete(schema.users).where(eq(schema.users.id, userId));

  await signOut({ redirectTo: "/" });
  return undefined;
}
