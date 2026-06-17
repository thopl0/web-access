import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Proxy (this Next renames "middleware" → "proxy"; runs on the Node.js runtime).
 *
 * OPTIMISTIC auth redirects ONLY — it checks for the *presence* of an Auth.js
 * session cookie, not its validity. The authoritative check lives in the DAL
 * (`lib/server/dal.ts`, `verifySession`), which every protected page and Server
 * Action calls itself. Proxy is just fast UX: bounce obviously-logged-out users
 * off /dashboard and obviously-logged-in users off /login,/signup.
 *
 * We deliberately do NOT verify the JWT here (it would cost on every prefetch)
 * nor use Auth.js's `auth` middleware wrapper (an Edge-`middleware` convention,
 * unverified under the renamed Node `proxy`).
 */

// Auth.js session-token cookie names: http (dev) and the __Secure- prefix (https).
const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

const PROTECTED_PREFIXES = ["/dashboard"];
const AUTH_PAGES = ["/login", "/signup"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));

  if (PROTECTED_PREFIXES.some((p) => pathname.startsWith(p)) && !hasSession) {
    return NextResponse.redirect(new URL("/login", request.nextUrl));
  }

  if (AUTH_PAGES.includes(pathname) && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", request.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  // Skip API routes (incl. /api/auth/*), the embed script, the demo page, Next
  // internals, and static assets.
  matcher: ["/((?!api|_next/static|_next/image|embed|demo|favicon.ico|.*\\.png$).*)"],
};
