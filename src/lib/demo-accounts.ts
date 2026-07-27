import "server-only";

/**
 * Demo sign-in shortcuts for the login screen.
 *
 * These mirror the accounts created by `prisma/seed.ts`. They exist purely to
 * speed up role-switching while testing.
 *
 * Security: this module is `server-only` and `getDemoAccounts()` returns null
 * in production, so the credentials are never serialized to the client and
 * never appear in a production bundle. Verified by
 * `npm run verify:no-demo-creds`.
 */

export type DemoAccount = {
  roleLabel: string;
  email: string;
  password: string;
  /** What this role is useful for testing. */
  hint: string;
};

/** Matches the seed script. Change both together. */
const DEMO_PASSWORD = "QroadDemo!2026";

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    roleLabel: "Administrator",
    email: "admin@qroad.test",
    password: DEMO_PASSWORD,
    hint: "Users, roles, settings and do-not-contact overrides",
  },
  {
    roleLabel: "Campaign Manager",
    email: "manager@qroad.test",
    password: DEMO_PASSWORD,
    hint: "Campaigns, imports, templates, assignment and reports",
  },
  {
    roleLabel: "Operator 1",
    email: "operator1@qroad.test",
    password: DEMO_PASSWORD,
    hint: "Carlo Mendoza — outreach queue and follow-ups",
  },
  {
    roleLabel: "Operator 2",
    email: "operator2@qroad.test",
    password: DEMO_PASSWORD,
    hint: "Dana Villanueva — use with Operator 1 to test concurrency",
  },
  {
    roleLabel: "Viewer",
    email: "viewer@qroad.test",
    password: DEMO_PASSWORD,
    hint: "Read-only enforcement",
  },
];

/**
 * The demo accounts in development, `null` in production.
 *
 * Returning null (rather than filtering in the component) keeps the credentials
 * out of the serialized props entirely.
 */
export function getDemoAccounts(): DemoAccount[] | null {
  return process.env.NODE_ENV === "production" ? null : DEMO_ACCOUNTS;
}
