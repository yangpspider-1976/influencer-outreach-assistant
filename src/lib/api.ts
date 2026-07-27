import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { ForbiddenError, UnauthorizedError, requireUser, type CurrentUser } from "./auth";
import { has, hasScope, type Permission, type Scope } from "./rbac";
import { isDatabaseUnavailable } from "./db-errors";

/** Thrown for expected, user-correctable failures. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string = "ERROR",
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** §18 — a stale optimistic-lock save must be rejected with a clear message. */
export class ConflictError extends ApiError {
  constructor(message = "This record was changed by someone else. Refresh and try again.") {
    super(409, message, "STALE_RECORD");
  }
}

export function jsonError(error: unknown): NextResponse {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: error.message, code: "UNAUTHORIZED" }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message, code: "FORBIDDEN" }, { status: 403 });
  }
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.message, code: error.code, details: error.details },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "The submitted data is not valid.",
        code: "VALIDATION_ERROR",
        details: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 422 },
    );
  }

  // §18 — an unreachable database is an infrastructure condition, not a bug.
  // Answer 503 with a clear message and a one-line log, not a raw stack.
  if (isDatabaseUnavailable(error)) {
    console.error("[api] database unavailable", {
      code: (error as { code?: unknown }).code ?? "unknown",
    });
    return NextResponse.json(
      {
        error: "The service is temporarily unavailable. Please try again in a moment.",
        code: "DATABASE_UNAVAILABLE",
      },
      { status: 503 },
    );
  }

  // Structured log without request bodies (§4 Observability).
  console.error("[api] unhandled error", {
    name: error instanceof Error ? error.name : "Unknown",
    message: error instanceof Error ? error.message : String(error),
  });
  return NextResponse.json(
    { error: "An unexpected error occurred.", code: "INTERNAL_ERROR" },
    { status: 500 },
  );
}

type Handler<C> = (context: { user: CurrentUser; params: C }) => Promise<NextResponse>;

/** Wraps a route handler with authentication and consistent error mapping. */
export function withAuth<C = Record<string, never>>(handler: Handler<C>) {
  return async (_request: Request, segment?: { params: Promise<C> }) => {
    try {
      const user = await requireUser();
      const params = segment?.params ? await segment.params : ({} as C);
      return await handler({ user, params });
    } catch (error) {
      return jsonError(error);
    }
  };
}

export function requirePermission(user: CurrentUser, permission: Permission): void {
  if (!has(user.permissions, permission)) {
    throw new ForbiddenError(`Your role cannot perform "${permission.replace(/_/g, " ")}".`);
  }
}

export function requireScope(user: CurrentUser, permission: Permission, minimum: Scope): void {
  if (!hasScope(user.permissions, permission, minimum)) {
    throw new ForbiddenError(`Your role cannot perform "${permission.replace(/_/g, " ")}".`);
  }
}

export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError(400, "A JSON request body is required.", "INVALID_JSON");
  }
  return schema.parse(raw);
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}
