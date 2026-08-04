/**
 * Production bootstrap — `npm run db:bootstrap`.
 *
 * Creates the four roles and a single administrator account so a freshly
 * deployed, empty database can be signed into. Unlike `db:seed` it adds NO demo
 * campaigns, clients or influencers. Safe to re-run (everything is upserted).
 *
 * Run once against the production database, e.g.:
 *   DATABASE_URL="postgres://…" \
 *   BOOTSTRAP_ADMIN_EMAIL="you@example.com" \
 *   BOOTSTRAP_ADMIN_PASSWORD="a-long-password" \
 *   npm run db:bootstrap
 *
 * Skip reasons and organization settings are configured afterwards in the app's
 * Admin console by the account created here.
 */

import "dotenv/config";
import { hash } from "@node-rs/argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { DEFAULT_PERMISSION_SETS, ROLE_DESCRIPTIONS, ROLE_LABELS } from "../src/lib/rbac";

const ARGON2_OPTIONS = { algorithm: 2 as const, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "Administrator";

  if (!email || !password) {
    throw new Error(
      "Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD before running db:bootstrap.",
    );
  }
  if (password.length < 12) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters long.");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const roleIds: Record<string, string> = {};
    for (const key of ["ADMIN", "CAMPAIGN_MANAGER", "OPERATOR", "VIEWER"] as const) {
      const role = await prisma.role.upsert({
        where: { key },
        update: { name: ROLE_LABELS[key], description: ROLE_DESCRIPTIONS[key] },
        create: {
          key,
          name: ROLE_LABELS[key],
          description: ROLE_DESCRIPTIONS[key],
          permissionSet: DEFAULT_PERMISSION_SETS[key],
        },
      });
      roleIds[key] = role.id;
    }

    const passwordHash = await hash(password, ARGON2_OPTIONS);
    const admin = await prisma.user.upsert({
      where: { email },
      update: { roleId: roleIds.ADMIN, status: "ACTIVE" },
      create: { email, name, passwordHash, roleId: roleIds.ADMIN },
    });

    console.log(`Bootstrap complete. Administrator ready: ${admin.email}`);
    console.log("Configure skip reasons and settings in the Admin console after signing in.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
