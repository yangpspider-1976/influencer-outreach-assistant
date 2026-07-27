import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { hash, verify } from "@node-rs/argon2";
import { prisma } from "./db";
import { env } from "./env";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
  verifySession,
} from "./session-token";
import { parsePermissionSet, type PermissionSet, type RoleKeyName } from "./rbac";

/** SEC-002 — Argon2id with OWASP-recommended parameters. */
const ARGON2_OPTIONS = {
  algorithm: 2 as const, // Argon2id
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(digest: string, plain: string): Promise<boolean> {
  try {
    return await verify(digest, plain, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  status: "ACTIVE" | "DISABLED";
  roleKey: RoleKeyName;
  roleName: string;
  permissions: PermissionSet;
  sessionId: string;
};

/**
 * Resolves the signed-in user for the current request.
 *
 * Re-reads the user on every call so a disabled account or a bumped
 * `sessionEpoch` invalidates live sessions immediately (SEC-011).
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const claims = await verifySession(token);
  if (!claims) return null;

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    include: { role: true },
  });
  if (!user || user.status !== "ACTIVE" || user.sessionEpoch !== claims.epoch) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    status: user.status,
    roleKey: user.role.key as RoleKeyName,
    roleName: user.role.name,
    permissions: parsePermissionSet(user.role.permissionSet),
    sessionId: claims.sid,
  };
}

export class UnauthorizedError extends Error {
  constructor(message = "Authentication required.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * FR-001 — the gate for API route handlers. Throws `UnauthorizedError`, which
 * `jsonError` maps to a 401. Do not use this in a page: a thrown error there is
 * surfaced as an unhandled application error even when the proxy has already
 * redirected. Pages use `requirePageUser` instead.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/**
 * FR-001 — the gate for server-component pages. Redirects to `/login` (a
 * `NEXT_REDIRECT`, which Next.js handles cleanly) rather than throwing, so an
 * unauthenticated visit produces a quiet redirect instead of a logged error.
 * The `(app)` layout redirects too; this keeps each page self-guarding without
 * racing that redirect into an error.
 */
export async function requirePageUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function establishSession(userId: string, sessionEpoch: number): Promise<string> {
  const sessionId = crypto.randomUUID();
  const token = await signSession({ sub: userId, sid: sessionId, epoch: sessionEpoch });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, sessionCookieOptions());
  return sessionId;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", { ...sessionCookieOptions(0), maxAge: 0 });
}

export async function requestMetadata(): Promise<{
  ipAddress: string | null;
  userAgent: string | null;
}> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  return {
    ipAddress: forwarded ? forwarded.split(",")[0].trim() : headerList.get("x-real-ip"),
    userAgent: headerList.get("user-agent"),
  };
}

export function isEmailDomainAllowed(email: string): boolean {
  if (env.allowedEmailDomains.length === 0) return true;
  const domain = email.split("@")[1]?.toLowerCase();
  return Boolean(domain && env.allowedEmailDomains.includes(domain));
}
