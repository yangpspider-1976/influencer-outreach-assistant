/**
 * UI smoke test (§19 "UI tests" and "Browser tests").
 *
 * Drives a real Chromium browser through the primary user flows and fails on
 * any page error, console error or 5xx response. Complements
 * `scripts/acceptance-walkthrough.mjs`, which covers the API contract.
 *
 * Requires **pristine seed data** — several checks assert the exact counts the
 * seed produces, so run npm run db:demo-reset first if earlier testing changed
 * the data. (The acceptance suite is self-contained and has no such need.)
 *
 * Usage:
 *   npx playwright install chromium     # once
 *   docker compose up -d db
 *   npm run db:migrate && npm run db:seed
 *   npm run db:demo-reset               # back to pristine counts
 *   npm run build && npm run start
 *   npm run test:ui
 *
 * Options:
 *   BASE=http://host:port   target server (default http://localhost:3000)
 *   SHOTS=./shots           write screenshots to this directory
 *   BROWSER=chromium|msedge which browser channel to drive
 *
 * Requires the demo seed data (prisma/seed.ts).
 */

import fs from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS ?? null;
const CHANNEL = process.env.BROWSER === "msedge" ? "msedge" : undefined;
const PASSWORD = "QroadDemo!2026";

if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const problems = [];

function check(label, condition, detail = "") {
  results.push({ label, pass: Boolean(condition), detail });
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

/**
 * 401 and 403 are designed application responses — a rejected sign-in, an
 * expired session, a role boundary. The browser logs them as console errors
 * regardless. Real defects surface as pageerror or 5xx, which are never
 * filtered.
 */
const EXPECTED_CONSOLE_NOISE = /status of (401|403)/;

function watch(page, who) {
  page.on("pageerror", (error) => problems.push(`[${who}] pageerror: ${error.message}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    if (EXPECTED_CONSOLE_NOISE.test(msg.text())) return;
    problems.push(`[${who}] console: ${msg.text()}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 500) problems.push(`[${who}] HTTP ${res.status()} ${res.url()}`);
  });
}

async function shot(page, name) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function signIn(context, email, who) {
  const page = await context.newPage();
  watch(page, who);
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 30_000 });
  return page;
}

const browser = await chromium.launch({ channel: CHANNEL });

try {
  // --- Sign-in screen ------------------------------------------------------
  const anonContext = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const anon = await anonContext.newPage();
  watch(anon, "anon");

  await anon.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  check("Signed-out visitor is redirected to sign-in", anon.url().includes("/login"), anon.url());
  await shot(anon, "01-login");

  await anon.fill("#email", "manager@qroad.test");
  await anon.fill("#password", "wrong-password");
  await anon.click('button[type="submit"]');
  await anon.waitForSelector('[role="alert"]', { timeout: 15_000 });
  check("A wrong password shows an inline error", true);
  check("Sign-in is refused with the wrong password", anon.url().includes("/login"));

  // --- Campaign manager ----------------------------------------------------
  const mgrContext = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const mgr = await signIn(mgrContext, "manager@qroad.test", "manager");
  check("Campaign manager reaches the dashboard", mgr.url().includes("/dashboard"));
  await shot(mgr, "02-dashboard");

  check(
    "Dashboard shows the live funnel",
    await mgr.isVisible("text=Reply rate"),
  );

  await mgr.goto(`${BASE}/campaigns`, { waitUntil: "networkidle" });
  check("Campaign list renders the seeded campaign", await mgr.isVisible("text=ABC Korean Restaurant Creator Visit"));
  await shot(mgr, "03-campaigns");

  await mgr.goto(`${BASE}/campaigns/seed-campaign-abc?tab=audience`, { waitUntil: "networkidle" });
  await mgr.waitForSelector("table", { timeout: 20_000 });
  check("Campaign audience table loads", (await mgr.$$("tbody tr")).length > 5);
  await shot(mgr, "04-audience");

  await mgr.goto(`${BASE}/campaigns/seed-campaign-abc?tab=analytics`, { waitUntil: "networkidle" });
  check("Campaign analytics render", await mgr.isVisible("text=Operator productivity"));
  await shot(mgr, "05-analytics");

  // --- Import wizard -------------------------------------------------------
  await mgr.goto(`${BASE}/campaigns/seed-campaign-abc/import`, { waitUntil: "networkidle" });
  await mgr.setInputFiles('input[type="file"]', "docs/sample-influencer-list.csv");
  // Wait for a mapping control, not the stepper label — "Map columns" is already
  // on screen during step 1 and would resolve before the upload finishes.
  await mgr.waitForSelector("#map-instagram_url", { timeout: 20_000 });
  check("Import wizard advances to column mapping", await mgr.isVisible("#map-instagram_url"));
  check(
    "Columns are auto-mapped from the header names",
    (await mgr.inputValue("#map-instagram_url")) === "instagram_url",
  );
  await shot(mgr, "06-import-mapping");

  await mgr.click("text=Validate rows");
  await mgr.waitForSelector("text=Validation results", { timeout: 30_000 });
  const tiles = await mgr.$$eval("p.text-2xl", (els) => els.map((e) => e.textContent?.trim()));
  check("Validation classifies every row", tiles[0] === "10", `total=${tiles[0]}`);
  check("Valid / warning / rejected are separated", tiles[1] === "6" && tiles[2] === "2" && tiles[3] === "2",
    tiles[1] === "0"
      ? `valid=${tiles[1]} warning=${tiles[2]} rejected=${tiles[3]} — these creators already exist; run "npm run db:demo-reset"`
      : `valid=${tiles[1]} warning=${tiles[2]} rejected=${tiles[3]}`);
  check("Unsupported domain is reported as an error",
    await mgr.isVisible("text=/is not a supported Instagram or Facebook domain/"));
  check("In-file duplicate is reported as a warning",
    await mgr.isVisible("text=/already appears earlier in this file/"));
  check("A rejected row cannot be selected",
    (await mgr.$$('input[type="checkbox"]:disabled')).length >= 2);
  await shot(mgr, "07-import-validation");

  // --- Templates and reports ----------------------------------------------
  await mgr.goto(`${BASE}/templates`, { waitUntil: "networkidle" });
  check("Template list and variable catalog render",
    await mgr.isVisible("text=Available variables"));
  await shot(mgr, "08-templates");

  await mgr.goto(`${BASE}/reports`, { waitUntil: "networkidle" });
  check("Reports render the §17 metrics", await mgr.isVisible("text=Outreach completion"));
  await shot(mgr, "09-reports");

  await mgr.goto(`${BASE}/pipeline`, { waitUntil: "networkidle" });
  await mgr.waitForTimeout(1500);
  check("Pipeline board shows all six lanes",
    (await mgr.$$("text=/^(Replied|Interested|Negotiating|Confirmed|Declined|No Response)$/")).length >= 6);
  await shot(mgr, "10-pipeline");

  // --- Operator workspace --------------------------------------------------
  const opContext = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const op = await signIn(opContext, "operator1@qroad.test", "operator");

  check("Operator does not see the administration link",
    !(await op.isVisible('a[href="/admin"]')));

  await op.goto(`${BASE}/outreach`, { waitUntil: "networkidle" });
  await op.waitForSelector("text=Campaign summary", { timeout: 20_000 });
  check("Outreach workspace loads one record", await op.isVisible("text=Record the outcome"));

  const message = await op.inputValue('textarea[aria-label="Message to send"]');
  check("Message renders with variables resolved",
    message.includes("ABC Korean Restaurant") && !message.includes("{{"),
    message.split("\n")[0]);
  check("Copy and profile buttons are present",
    (await op.isVisible("text=Copy message")) && (await op.isVisible("text=Open Instagram")));
  check("Mark Sent is disabled until the operator confirms",
    await op.isDisabled('button:has-text("Mark sent")'));
  await shot(op, "11-outreach-workspace");

  // Ticking the confirmation must enable Mark Sent — and nothing else may.
  await op.check('input[type="checkbox"]:near(:text("I manually sent this message"))');
  await op.waitForTimeout(300);
  check("Mark Sent enables only after explicit confirmation",
    !(await op.isDisabled('button:has-text("Mark sent")')));

  await op.goto(`${BASE}/follow-ups`, { waitUntil: "networkidle" });
  await op.waitForTimeout(1200);
  check("Follow-up queue renders", await op.isVisible("text=/Due and overdue|Nothing to follow up/"));
  await shot(op, "12-follow-ups");

  // --- Administrator -------------------------------------------------------
  const adminContext = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const admin = await signIn(adminContext, "admin@qroad.test", "admin");
  await admin.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  check("Administration console renders users and role permissions",
    (await admin.isVisible("text=Role permissions")) && (await admin.isVisible("text=Skip reasons")));
  await shot(admin, "13-admin");

  await admin.goto(`${BASE}/audit`, { waitUntil: "networkidle" });
  check("Audit log renders", await admin.isVisible("text=/Actor/"));
  await shot(admin, "14-audit");

  // --- Viewer is read-only -------------------------------------------------
  const viewerContext = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const viewer = await signIn(viewerContext, "viewer@qroad.test", "viewer");
  check("Viewer sees no outreach workspace link",
    !(await viewer.isVisible('a[href="/outreach"]')));
  check("Viewer sees no administration link",
    !(await viewer.isVisible('a[href="/admin"]')));

  // --- Responsive ----------------------------------------------------------
  for (const width of [1280, 1440, 1920]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await signIn(ctx, "manager@qroad.test", `responsive-${width}`);
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    check(`Dashboard has no horizontal overflow at ${width}px`, !overflows);
    await ctx.close();
  }
} finally {
  await browser.close();
}

const unique = [...new Set(problems)];
console.log(`\n${unique.length} page/console/5xx problems`);
for (const problem of unique.slice(0, 20)) console.log(`  ${problem}`);

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} UI checks passed.`);
if (failed.length || unique.length) {
  if (failed.length) {
    console.log("\nFAILURES:");
    for (const f of failed) console.log(`  ${f.label} — ${f.detail}`);
  }
  process.exitCode = 1;
}
