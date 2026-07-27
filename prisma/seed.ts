/**
 * Seed entry point — `npm run db:seed`.
 *
 * The dataset itself lives in `src/lib/demo-seed.ts` so the administrator-only
 * reset endpoint can rebuild exactly the same demo data from inside the app.
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { seedDemoData } from "../src/lib/demo-seed";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

seedDemoData(prisma, (message) => console.log(message))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
