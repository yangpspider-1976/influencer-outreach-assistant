import { describe, expect, it } from "vitest";
import { isDatabaseUnavailable } from "@/lib/db-errors";

/**
 * §18 — a database outage must be reported as a clean 503, not a raw 500 with a
 * stack trace. `jsonError` routes anything `isDatabaseUnavailable` returns true
 * for to a 503 `DATABASE_UNAVAILABLE` response; the classifier is the substance
 * and is checked here against the error shapes the pg adapter and Prisma
 * actually surface.
 */
describe("isDatabaseUnavailable", () => {
  function make(name: string, code?: string) {
    const error = new Error("boom") as Error & { code?: string };
    error.name = name;
    if (code) error.code = code;
    return error;
  }

  it("flags a refused pg connection", () => {
    expect(isDatabaseUnavailable(make("PrismaClientKnownRequestError", "ECONNREFUSED"))).toBe(true);
  });

  it("flags the Prisma connection codes", () => {
    for (const code of ["P1001", "P1002", "P1008", "P1017"]) {
      expect(isDatabaseUnavailable(make("PrismaClientKnownRequestError", code))).toBe(true);
    }
  });

  it("flags a Prisma initialization failure regardless of code", () => {
    expect(isDatabaseUnavailable(make("PrismaClientInitializationError"))).toBe(true);
  });

  it("flags the other driver connection errnos", () => {
    for (const code of ["ETIMEDOUT", "ENOTFOUND", "ECONNRESET"]) {
      expect(isDatabaseUnavailable(make("PrismaClientKnownRequestError", code))).toBe(true);
    }
  });

  it("does NOT flag an ordinary Prisma query error", () => {
    // A unique-constraint violation is a real 500, not a 503.
    expect(isDatabaseUnavailable(make("PrismaClientKnownRequestError", "P2002"))).toBe(false);
    expect(isDatabaseUnavailable(make("PrismaClientValidationError"))).toBe(false);
  });

  it("does not misclassify a non-Prisma error that happens to carry a code", () => {
    expect(isDatabaseUnavailable(make("TypeError", "ECONNREFUSED"))).toBe(false);
  });

  it("is safe on non-error values", () => {
    expect(isDatabaseUnavailable(null)).toBe(false);
    expect(isDatabaseUnavailable(undefined)).toBe(false);
    expect(isDatabaseUnavailable("boom")).toBe(false);
    expect(isDatabaseUnavailable({})).toBe(false);
  });
});
