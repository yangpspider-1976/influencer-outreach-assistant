/**
 * Session token signing/verification. Kept free of `server-only` and of any
 * database import so the Next.js proxy can verify sessions at the edge.
 *
 * SEC-003 — the token is delivered in a secure, HTTP-only, SameSite cookie.
 */

import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "qroad_session";

export type SessionClaims = {
  /** User id. */
  sub: string;
  /** Session identifier, recorded in the audit log (FR-024). */
  sid: string;
  /** User.sessionEpoch at sign-in; a mismatch invalidates the token (SEC-011). */
  epoch: number;
  /** Absolute sign-in time, independent of the rolling idle expiry. */
  iat: number;
  exp: number;
};

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET is missing or shorter than 32 characters.");
  }
  return new TextEncoder().encode(secret);
}

export function idleTimeoutSeconds(): number {
  const minutes = Number.parseInt(process.env.SESSION_IDLE_TIMEOUT_MINUTES || "60", 10);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 60) * 60;
}

export async function signSession(
  claims: Pick<SessionClaims, "sub" | "sid" | "epoch">,
  issuedAt = Math.floor(Date.now() / 1000),
): Promise<string> {
  return new SignJWT({ sid: claims.sid, epoch: claims.epoch })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt(issuedAt)
    .setIssuer("qroad-ioa")
    .setAudience("qroad-ioa")
    .setExpirationTime(Math.floor(Date.now() / 1000) + idleTimeoutSeconds())
    .sign(secretKey());
}

export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: "qroad-ioa",
      audience: "qroad-ioa",
    });
    if (!payload.sub || typeof payload.sid !== "string") return null;
    return {
      sub: payload.sub,
      sid: payload.sid,
      epoch: typeof payload.epoch === "number" ? payload.epoch : 0,
      iat: payload.iat ?? 0,
      exp: payload.exp ?? 0,
    };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAgeSeconds = idleTimeoutSeconds()) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    // TLS is required everywhere except isolated local development (SEC-001).
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
