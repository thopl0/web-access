import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * Clear a stale Auth.js session and bounce to /login.
 *
 * A JWT session is self-contained and stays cryptographically valid until it expires — even if the
 * user it names no longer exists (account deleted, or the dev DB was reset). The DAL detects that
 * "valid session, missing user" case and redirects here. We can't clear cookies from a Server
 * Component, but a Route Handler can — and `/api/*` is excluded from the proxy's optimistic
 * /login→/dashboard redirect, so this can't loop. We delete every auth cookie (including the
 * numbered chunks Auth.js splits large JWTs into) on the redirect response.
 */
export async function GET(request: Request) {
  const store = await cookies();
  const res = NextResponse.redirect(new URL("/login?session=expired", request.url));
  for (const c of store.getAll()) {
    if (c.name.includes("authjs.session-token") || c.name.includes("authjs.csrf-token")) {
      res.cookies.delete(c.name);
    }
  }
  return res;
}
