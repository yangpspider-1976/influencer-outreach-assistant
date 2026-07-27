/**
 * Command-line counterpart to the administrator "reset and reseed" action —
 * `npm run db:demo-reset`.
 *
 * Wipes campaign and influencer data, then rebuilds the demo dataset. Unlike
 * `npm run db:reset` this does not drop the schema or touch users, roles and
 * settings, so it is much faster and leaves accounts intact.
 *
 * Use it to return to a pristine state before running the UI smoke test, which
 * asserts the exact counts the seed produces.
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { resetAndReseedDemoData } from "../src/lib/demo-seed";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

resetAndReseedDemoData(prisma, (message) => console.log(message))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
