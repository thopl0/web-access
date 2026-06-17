"use server";

import { randomUUID } from "node:crypto";
import { AuthError } from "next-auth";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { signIn, signOut } from "@/auth";
import { db, schema } from "@/lib/server/db";
import { hashPassword } from "@/lib/server/password";

/** Shape consumed by the auth form. Field keys line up with the form inputs;
 *  `_form` holds errors not tied to a single field (e.g. wrong credentials). */
export type AuthFormState = {
  errors?: {
    name?: string[];
    email?: string[];
    password?: string[];
    _form?: string[];
  };
} | undefined;

const SignupSchema = z.object({
  name: z.string().trim().max(120).optional(),
  email: z.string().trim().toLowerCase().email({ message: "Enter a valid email address." }),
  password: z.string().min(8, { message: "Use at least 8 characters." }),
});

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email({ message: "Enter a valid email address." }),
  password: z.string().min(1, { message: "Enter your password." }),
});

export async function signup(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = SignupSchema.safeParse({
    name: formData.get("name") || undefined,
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const { name, email, password } = parsed.data;

  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  if (existing.length > 0) {
    return { errors: { email: ["That email is already registered."] } };
  }

  const passwordHash = await hashPassword(password);
  await db.insert(schema.users).values({
    id: `usr_${randomUUID()}`,
    email,
    name: name ?? null,
    passwordHash,
  });

  // Sign the new user in. On success this throws a redirect to /dashboard, which
  // must propagate out of the Server Action — so we don't catch it here.
  await signIn("credentials", { email, password, redirectTo: "/dashboard" });
  return undefined;
}

export async function login(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/dashboard",
    });
    return undefined;
  } catch (error) {
    // A bad password surfaces as a CredentialsSignin AuthError. Anything else
    // (notably the NEXT_REDIRECT thrown on success) must keep propagating.
    if (error instanceof AuthError) {
      return { errors: { _form: ["Wrong email or password."] } };
    }
    throw error;
  }
}

export async function logout(): Promise<void> {
  await signOut({ redirectTo: "/" });
}

export async function signInWithGoogle(): Promise<void> {
  // Throws a redirect to Google's consent screen; lets NEXT_REDIRECT propagate.
  await signIn("google", { redirectTo: "/dashboard" });
}
