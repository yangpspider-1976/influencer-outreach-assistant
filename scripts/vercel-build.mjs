/**
 * Vercel build pipeline.
 *
 * Runs database migrations against the direct (unpooled) connection, optionally
 * bootstraps an admin and/or seeds demo data when the matching env vars are set,
 * then builds the app. Kept as a script so the Vercel buildCommand stays short
 * and portable (no shell-specific syntax / line-ending pitfalls).
 */

import { execSync } from "node:child_process";

// Migrations, bootstrap and seed need a direct connection — Neon's pooled
// pgbouncer URL can't run them reliably.
const directUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
const withDirect = { env: { ...process.env, DATABASE_URL: directUrl }, stdio: "inherit" };

execSync("npx prisma migrate deploy", withDirect);

if (process.env.BOOTSTRAP_ADMIN_EMAIL) {
  execSync("npx tsx prisma/bootstrap.ts", withDirect);
}

if (process.env.SEED_DEMO === "1") {
  execSync("npx tsx prisma/seed.ts", withDirect);
}

// The app build itself does not touch the database (dynamic pages only).
execSync("npm run build", { stdio: "inherit" });
