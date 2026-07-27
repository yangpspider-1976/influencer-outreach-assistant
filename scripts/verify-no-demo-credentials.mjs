/**
 * Guards the development-only demo sign-in shortcuts.
 *
 * `src/lib/demo-accounts.ts` is server-only and returns null in production, so
 * a production build must never deliver the seeded credentials to a browser.
 * This script proves that by scanning the build output.
 *
 * The strings to look for are read out of the source module rather than
 * hardcoded here, so this file contains no credential literals of its own and
 * stays correct if the demo accounts change.
 *
 * ## What is checked, and why that is the right scope
 *
 * Checked: `.next/static/**` — everything a browser can download. It must
 * contain no demo credential. That is the security property that matters, and
 * it is what proves the development-only login panel really is compiled out.
 *
 * Deliberately **not** checked:
 *
 * - Server code (`.next/server/**`). Seeding demo accounts is a server-side
 *   feature: `src/lib/demo-seed.ts` creates those users and is imported by the
 *   administrator reset endpoint, so the password legitimately appears in the
 *   server bundle.
 * - `prisma/seed.ts`, which ships on purpose so an operator can run `db:seed`.
 * - Sourcemaps, which embed the original TypeScript and are never served.
 *
 * In short: the demo password existing inside the image is expected and
 * unavoidable; it reaching a browser is not, and that is what this asserts.
 *
 * Usage:
 *   npm run build
 *   npm run verify:no-demo-creds
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BUILD_DIR = path.join(".next", "static");
const SOURCE = "src/lib/demo-accounts.ts";
const SELF = path.basename(fileURLToPath(import.meta.url));


const SCAN_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".json", ".html", ".rsc", ".txt"]);

if (!fs.existsSync(BUILD_DIR)) {
  console.error(`No ${BUILD_DIR}/ directory. Run "npm run build" first.`);
  process.exit(1);
}
if (!fs.existsSync(SOURCE)) {
  console.error(`Cannot find ${SOURCE} to derive the credentials from.`);
  process.exit(1);
}

// Pull every quoted email and the password constant out of the source module.
const source = fs.readFileSync(SOURCE, "utf8");
const needles = new Set();
for (const match of source.matchAll(/["'`]([^"'`\s]+@[^"'`\s]+\.[a-z]{2,})["'`]/gi)) {
  needles.add(match[1]);
}
const passwordMatch = /DEMO_PASSWORD\s*=\s*["'`]([^"'`]+)["'`]/.exec(source);
if (passwordMatch) needles.add(passwordMatch[1]);

if (needles.size === 0) {
  console.error(`Derived no credentials from ${SOURCE} — the check would be vacuous.`);
  process.exit(1);
}

const hits = [];
let scanned = 0;

function walk(dir, depth = 0) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      walk(path.join(dir, entry.name), depth + 1);
      continue;
    }
    // Never flag this scanner if the build copied it into the output.
    if (entry.name === SELF) continue;
    if (!SCAN_EXTENSIONS.has(path.extname(entry.name))) continue;

    const file = path.join(dir, entry.name);
    let contents;
    try {
      contents = fs.readFileSync(file, "utf8");
    } catch {
      continue; // unreadable or binary
    }
    scanned += 1;
    for (const needle of needles) {
      if (contents.includes(needle)) hits.push({ file, needle });
    }
  }
}

walk(BUILD_DIR);

// A scan that reaches nothing would pass silently and prove nothing.
if (scanned === 0) {
  console.error(`Scanned no files under ${BUILD_DIR}/ — the check would be vacuous.`);
  process.exit(1);
}

console.log(
  `Scanned ${scanned} browser-downloadable files in ${BUILD_DIR}/ for ${needles.size} demo credentials.`,
);

if (hits.length > 0) {
  console.error(`\nFAIL — demo credentials are downloadable by a browser:\n`);
  for (const hit of hits) console.error(`  ${hit.needle.padEnd(24)} ${hit.file}`);
  console.error(
    `\nThe demo sign-in shortcuts must stay development-only. Check that\n` +
      `${SOURCE} still returns null when NODE_ENV=production and that nothing\n` +
      `imports the credential list directly.`,
  );
  process.exit(1);
}

console.log("PASS — no demo credential is reachable from the browser bundle.");
