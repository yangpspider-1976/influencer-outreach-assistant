/**
 * Pure database-error classification. No imports, so it can be unit-tested
 * without pulling in the Prisma client or the `server-only` guard.
 */

/**
 * True when an error means the database is unreachable rather than a bug.
 *
 * Duck-typed on `name` + `code` so it works whether the failure surfaces as a
 * Prisma initialization error, a connection-class Prisma request error
 * (P1001/P1002/P1008/P1017), or a raw driver errno bubbled up by the pg adapter
 * (ECONNREFUSED / ETIMEDOUT / ENOTFOUND / ECONNRESET).
 */
export function isDatabaseUnavailable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String((error as { name?: unknown }).name) : "";
  const code = "code" in error ? String((error as { code?: unknown }).code) : "";
  if (name === "PrismaClientInitializationError") return true;
  if (!name.startsWith("Prisma")) return false;
  return (
    ["P1001", "P1002", "P1008", "P1017"].includes(code) ||
    ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "ECONNRESET"].includes(code)
  );
}
