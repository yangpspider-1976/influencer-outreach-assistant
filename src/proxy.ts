import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  idleTimeoutSeconds,
  sessionCookieOptions,
  signSession,
  verifySession,
} from "@/lib/session-token";

/**
 * FR-001 — no campaign or influencer surface is reachable without a session.
 * The definitive check still happens server-side in every route handler and
 * page (FR-002); this only avoids rendering shells for signed-out visitors and
 * keeps the rolling inactivity window fresh (SEC-011).
 *
 * Next.js 16 renamed the `middleware` file convention to `proxy`.
 */

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/health"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const claims = token ? await verifySession(token) : null;

  // Public paths always pass through. Note we deliberately do NOT redirect
  // /login → /dashboard here based on the token: the proxy only verifies the
  // JWT (signature + expiry), while getCurrentUser also checks that the user
  // still exists, is active and has a matching session epoch. If a token is
  // JWT-valid but the user is not (e.g. deleted or disabled), a proxy-level
  // /login → /dashboard bounce would fight the page-level /dashboard → /login
  // redirect and loop. The /login page makes that decision with the deep check.
  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  if (!claims) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Authentication required.", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
    if (token) loginUrl.searchParams.set("expired", "1");
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.next();

  // Rolling idle expiry: refresh once a third of the window has elapsed.
  const remaining = claims.exp - Math.floor(Date.now() / 1000);
  if (remaining < idleTimeoutSeconds() * (2 / 3)) {
    const refreshed = await signSession(
      { sub: claims.sub, sid: claims.sid, epoch: claims.epoch },
      claims.iat,
    );
    response.cookies.set(SESSION_COOKIE, refreshed, sessionCookieOptions());
  }

  return response;
}

export const config = {
  // Exclude all framework-internal `_next/` paths (static assets, image
  // optimizer, and dev-only endpoints such as `_next/webpack-hmr`) so the auth
  // gate never intercepts them — otherwise HMR breaks, especially over the LAN.
  // App pages, API routes, RSC payloads and Server Actions use the route path
  // (not `_next/`), so they still pass through and stay protected.
  matcher: ["/((?!_next/|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};
