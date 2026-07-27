/**
 * Demo dataset: creation and reset.
 *
 * Produces the §19 user-acceptance scenario — one realistic restaurant campaign
 * with more than 50 sample influencers across multiple operators, plus the four
 * roles, skip reasons and an approved message template.
 *
 * Two callers share this module:
 *   - `prisma/seed.ts` (npm run db:seed)
 *   - the administrator-only reset endpoint (POST /api/admin/reset-demo-data)
 *
 * Not marked `server-only` because the standalone seed script imports it
 * outside the Next.js bundler. It is never imported by a client component.
 */

import { hash } from "@node-rs/argon2";
import type { PrismaClient } from "../generated/prisma/client";
import { DEFAULT_PERMISSION_SETS, ROLE_DESCRIPTIONS, ROLE_LABELS } from "./rbac";
import { DEFAULT_TEMPLATE_CONTENT, extractTokens } from "./template";
import { normalizeProfileUrl } from "./social-url";
import { planFollowUps } from "./follow-up";

export type DemoSeedSummary = {
  campaigns: number;
  influencers: number;
  records: number;
  followUps: number;
};

const ARGON2_OPTIONS = { algorithm: 2 as const, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

/** Fixed so repeated seeds produce identical demo data. */
const PRNG_SEED = 20260716;

function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/** Reassigned at the start of every seed run so results stay deterministic. */
let random = makeRandom(PRNG_SEED);

function pick<T>(items: T[]): T {
  return items[Math.floor(random() * items.length)];
}

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

/**
 * Deletes all campaign and influencer data, in foreign-key-safe order.
 *
 * Deliberately preserves `users`, `roles`, `app_settings` and templates so the
 * administrator performing the reset keeps their session and the organization's
 * configuration survives. `seedDemoData` re-upserts the demo accounts anyway.
 */
export async function wipeDemoData(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction([
    prisma.followUpTask.deleteMany({}),
    prisma.outreachAttempt.deleteMany({}),
    prisma.importRow.deleteMany({}),
    prisma.import.deleteMany({}),
    prisma.exportJob.deleteMany({}),
    prisma.campaignInfluencer.deleteMany({}),
    prisma.campaign.deleteMany({}),
    prisma.influencerTag.deleteMany({}),
    prisma.socialProfile.deleteMany({}),
    prisma.influencer.deleteMany({}),
    prisma.tag.deleteMany({}),
    prisma.client.deleteMany({}),
    prisma.auditLog.deleteMany({}),
  ]);
}

/** Wipes campaign and influencer data, then rebuilds the demo dataset. */
export async function resetAndReseedDemoData(
  prisma: PrismaClient,
  log: (message: string) => void = () => {},
): Promise<DemoSeedSummary> {
  log("Wiping campaign and influencer data…");
  await wipeDemoData(prisma);
  return seedDemoData(prisma, log);
}

const FIRST_NAMES = [
  "Maria", "Jose", "Ana", "Paolo", "Bea", "Miguel", "Camille", "Rafael", "Isabel", "Luis",
  "Nadine", "Enzo", "Trisha", "Marco", "Kim", "Diego", "Sofia", "Lance", "Hannah", "Julian",
  "Patricia", "Nico", "Andrea", "Gabriel", "Louise", "Ramon", "Faith", "Karl", "Denise", "Aaron",
  "Cielo", "Bryan", "Reese", "Vince", "Erika", "Jomar", "Katrina", "Dominic", "Yza", "Migs",
  "Charlene", "Renz", "Athena", "Kier", "Marielle", "Jed", "Nikki", "Arvin", "Shane", "Toby",
  "Regine", "Emman", "Joy", "Francis", "Alexa",
];

const LAST_NAMES = [
  "Santos", "Reyes", "Cruz", "Bautista", "Ocampo", "Garcia", "Mendoza", "Torres", "Villanueva",
  "Ramos", "Aquino", "Dela Cruz", "Navarro", "Salazar", "Lim", "Tan", "Domingo", "Fernandez",
  "Castillo", "Rivera", "Gonzales", "Padilla", "Manalo", "Soriano", "Alvarez",
];

const CATEGORIES = [
  "Food", "Food / Lifestyle", "Lifestyle", "Family", "Travel", "Beauty", "Food / Travel",
];

const LOCATIONS = [
  "BGC, Taguig", "Makati", "Quezon City", "Pasig", "Mandaluyong", "Manila", "Parañaque",
  "Alabang, Muntinlupa", "San Juan", "Metro Manila",
];

const NOTES = [
  "Previously posted Korean restaurant content.",
  "Strong Reels engagement, mostly food reviews.",
  "Worked with QROAD on a 2025 cafe campaign.",
  "Family-oriented audience, good for weekend visits.",
  "High story completion rate.",
  "",
  "Prefers weekday visits.",
  "Requested full brief before committing last time.",
];

export async function seedDemoData(
  prisma: PrismaClient,
  log: (message: string) => void = () => {},
): Promise<DemoSeedSummary> {
  // Re-seed the PRNG so every run produces byte-identical demo data.
  random = makeRandom(PRNG_SEED);
  log("Seeding QROAD Influencer Outreach Assistant…");

  // -- Roles ---------------------------------------------------------------
  const roles: Record<string, string> = {};
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
    roles[key] = role.id;
  }

  // -- Users ---------------------------------------------------------------
  const demoPassword = "QroadDemo!2026";
  const passwordHash = await hash(demoPassword, ARGON2_OPTIONS);

  const userSpecs = [
    { email: "admin@qroad.test", name: "Alex Reyes", roleKey: "ADMIN" },
    { email: "manager@qroad.test", name: "Bianca Cruz", roleKey: "CAMPAIGN_MANAGER" },
    { email: "operator1@qroad.test", name: "Carlo Mendoza", roleKey: "OPERATOR" },
    { email: "operator2@qroad.test", name: "Dana Villanueva", roleKey: "OPERATOR" },
    { email: "viewer@qroad.test", name: "Ella Tan", roleKey: "VIEWER" },
  ];

  const users: Record<string, { id: string; name: string }> = {};
  for (const spec of userSpecs) {
    const user = await prisma.user.upsert({
      where: { email: spec.email },
      update: { name: spec.name, roleId: roles[spec.roleKey], status: "ACTIVE" },
      create: {
        email: spec.email,
        name: spec.name,
        passwordHash,
        roleId: roles[spec.roleKey],
      },
    });
    users[spec.email] = { id: user.id, name: user.name };
  }

  const manager = users["manager@qroad.test"];
  const operators = [users["operator1@qroad.test"], users["operator2@qroad.test"]];

  // -- Controlled lists and settings ---------------------------------------
  const skipReasons = [
    "Profile not relevant to the campaign",
    "Audience outside the campaign location",
    "Account appears inactive",
    "Already working with a competing brand",
    "Message request unavailable",
    "Needs campaign manager review",
  ];
  for (const [index, label] of skipReasons.entries()) {
    await prisma.skipReason.upsert({
      where: { label },
      update: { sortOrder: index, active: true },
      create: { label, sortOrder: index },
    });
  }

  const settings: [string, unknown][] = [
    ["retention.audit_log_days", 730],
    ["retention.import_file_days", 180],
    ["outreach.disclaimer", "You are responsible for verifying the recipient and message before sending."],
    ["organization.name", "QROAD Influencer Marketing"],
  ];
  for (const [key, value] of settings) {
    await prisma.appSetting.upsert({
      where: { key },
      update: { value: value as object },
      create: { key, value: value as object },
    });
  }

  // -- Template ------------------------------------------------------------
  const template = await prisma.messageTemplate.upsert({
    where: { id: "seed-template-restaurant" },
    update: {},
    create: {
      id: "seed-template-restaurant",
      name: "Restaurant creator visit - first contact",
      platform: "ANY",
      language: "en",
      status: "APPROVED",
      description: "Approved first-contact invitation for restaurant creator visits.",
      createdById: manager.id,
    },
  });

  const templateVersion = await prisma.templateVersion.upsert({
    where: { templateId_version: { templateId: template.id, version: 1 } },
    update: {},
    create: {
      templateId: template.id,
      version: 1,
      content: DEFAULT_TEMPLATE_CONTENT,
      variables: extractTokens(DEFAULT_TEMPLATE_CONTENT),
      lockedTokens: ["compensation", "deliverables"],
      status: "APPROVED",
      versionNote: "Initial approved wording.",
      approvedById: manager.id,
      approvedAt: daysAgo(20),
    },
  });

  await prisma.messageTemplate.update({
    where: { id: template.id },
    data: { currentVersionId: templateVersion.id },
  });

  // -- Client and campaign -------------------------------------------------
  const client = await prisma.client.upsert({
    where: { name: "ABC Korean Restaurant" },
    update: {},
    create: {
      name: "ABC Korean Restaurant",
      contactName: "Ms. Jin Park",
      contactEmail: "marketing@abckorean.test",
      notes: "Flagship branch at BGC. Prefers food and lifestyle creators.",
    },
  });

  const campaign = await prisma.campaign.upsert({
    where: { id: "seed-campaign-abc" },
    update: {},
    create: {
      id: "seed-campaign-abc",
      clientId: client.id,
      name: "ABC Korean Restaurant Creator Visit",
      location: "BGC, Taguig",
      visitStart: new Date("2026-08-10T00:00:00.000Z"),
      visitEnd: new Date("2026-08-20T00:00:00.000Z"),
      deliverables: "1 Reel + 3 Stories + location tag\nPosting window: within 5 days of the visit.",
      deliverablesShort: "1 Reel + 3 Stories + location tag",
      compensation: "PHP 5,000 + complimentary meal for two",
      applicationDeadline: new Date("2026-08-05T00:00:00.000Z"),
      targetCategory: "Food, lifestyle, family",
      targetLocation: "Metro Manila",
      ownerId: manager.id,
      templateVersionId: templateVersion.id,
      status: "ACTIVE",
      activatedAt: daysAgo(14),
      notes: "Client asked for at least 12 confirmed creators. Keep tone friendly and concise.",
      followUpOffsetDays: [3, 7],
    },
  });

  const secondCampaign = await prisma.campaign.upsert({
    where: { id: "seed-campaign-cafe" },
    update: {},
    create: {
      id: "seed-campaign-cafe",
      clientId: client.id,
      name: "ABC Korean Restaurant - Makati Soft Launch",
      location: "Makati",
      visitStart: new Date("2026-09-01T00:00:00.000Z"),
      visitEnd: new Date("2026-09-07T00:00:00.000Z"),
      deliverables: "1 Reel + 2 Stories",
      deliverablesShort: "1 Reel + 2 Stories",
      compensation: "PHP 3,500 + complimentary meal for two",
      applicationDeadline: new Date("2026-08-25T00:00:00.000Z"),
      ownerId: manager.id,
      templateVersionId: templateVersion.id,
      status: "DRAFT",
      notes: "Waiting for the client to confirm the soft-launch date.",
    },
  });

  // -- Influencers ---------------------------------------------------------
  const existing = await prisma.campaignInfluencer.count({ where: { campaignId: campaign.id } });
  if (existing > 0) {
    log(`Campaign audience already seeded (${existing} records). Skipping.`);
    return summarize(prisma, log);
  }

  const usedHandles = new Set<string>();
  const audience: { influencerId: string; index: number }[] = [];

  for (let index = 0; index < 56; index += 1) {
    const firstName = FIRST_NAMES[index % FIRST_NAMES.length];
    const lastName = pick(LAST_NAMES);
    const displayName = `${firstName} ${lastName}`;

    let handle = `${firstName}.${lastName}`.toLowerCase().replace(/[^a-z0-9._]/g, "");
    while (usedHandles.has(handle)) handle = `${handle}${Math.floor(random() * 90 + 10)}`;
    usedHandles.add(handle);

    const hasFacebook = random() > 0.35;
    const followers = Math.floor(random() * 240_000) + 4_000;

    const influencer = await prisma.influencer.create({
      data: {
        displayName,
        firstName,
        isDemo: true,
        category: pick(CATEGORIES),
        location: pick(LOCATIONS),
        followerCountRaw: String(followers),
        followerCountNumeric: followers,
        email: random() > 0.6 ? `${handle}@creators.test` : null,
        rate: random() > 0.5 ? `PHP ${(Math.floor(random() * 8) + 3) * 1000}` : null,
        notes: pick(NOTES),
        // Two creators opted out — they must never reach the queue (AC-004).
        dncFlag: index === 12 || index === 41,
        dncReason: index === 12 || index === 41 ? "Creator asked not to be contacted again." : null,
        dncSetById: index === 12 || index === 41 ? manager.id : null,
        dncSetAt: index === 12 || index === 41 ? daysAgo(40) : null,
      },
    });

    const instagram = normalizeProfileUrl(`https://www.instagram.com/${handle}/`, "INSTAGRAM");
    if (instagram.ok) {
      await prisma.socialProfile.create({
        data: {
          influencerId: influencer.id,
          platform: "INSTAGRAM",
          originalUrl: instagram.originalUrl,
          normalizedUrl: instagram.normalizedUrl,
          usernameHint: instagram.usernameHint,
          preferredFlag: true,
        },
      });
    }
    if (hasFacebook) {
      const facebook = normalizeProfileUrl(`https://www.facebook.com/${handle}`, "FACEBOOK");
      if (facebook.ok) {
        await prisma.socialProfile.create({
          data: {
            influencerId: influencer.id,
            platform: "FACEBOOK",
            originalUrl: facebook.originalUrl,
            normalizedUrl: facebook.normalizedUrl,
            usernameHint: facebook.usernameHint,
          },
        });
      }
    }

    audience.push({ influencerId: influencer.id, index });
  }

  // Tags
  for (const tagName of ["food", "bgc", "reels", "family", "travel"]) {
    await prisma.tag.upsert({ where: { name: tagName }, update: {}, create: { name: tagName } });
  }
  const tagRows = await prisma.tag.findMany();
  for (const entry of audience) {
    const tag = pick(tagRows);
    await prisma.influencerTag.upsert({
      where: { influencerId_tagId: { influencerId: entry.influencerId, tagId: tag.id } },
      update: {},
      create: { influencerId: entry.influencerId, tagId: tag.id },
    });
  }

  // -- Campaign audience with a realistic funnel ---------------------------
  // Distribution keeps every dashboard metric non-zero and independently
  // checkable against the §17 formulas (AC-010).
  const plan: { status: string; pipeline: string; count: number }[] = [
    { status: "CONFIRMED", pipeline: "CONFIRMED", count: 6 },
    { status: "NEGOTIATING", pipeline: "NEGOTIATING", count: 4 },
    { status: "INTERESTED", pipeline: "INTERESTED", count: 5 },
    { status: "REPLIED", pipeline: "REPLIED", count: 4 },
    { status: "DECLINED", pipeline: "DECLINED", count: 3 },
    { status: "NO_RESPONSE", pipeline: "NO_RESPONSE", count: 4 },
    { status: "FOLLOW_UP_DUE", pipeline: "NONE", count: 5 },
    { status: "SENT", pipeline: "NONE", count: 6 },
    { status: "INVALID", pipeline: "NONE", count: 2 },
    { status: "DUPLICATE", pipeline: "NONE", count: 1 },
    { status: "READY", pipeline: "NONE", count: 14 },
  ];

  let cursor = 0;
  for (const entry of audience) {
    const influencer = await prisma.influencer.findUniqueOrThrow({
      where: { id: entry.influencerId },
    });

    if (influencer.dncFlag) {
      await prisma.campaignInfluencer.create({
        data: {
          campaignId: campaign.id,
          influencerId: influencer.id,
          outreachStatus: "DO_NOT_CONTACT",
        },
      });
      continue;
    }

    let status = "NOT_CONTACTED";
    let pipeline = "NONE";
    let consumed = 0;
    for (const bucket of plan) {
      if (cursor < consumed + bucket.count) {
        status = bucket.status;
        pipeline = bucket.pipeline;
        break;
      }
      consumed += bucket.count;
    }
    cursor += 1;

    const assignee = status === "NOT_CONTACTED" ? null : operators[cursor % operators.length];
    const sentAt = daysAgo(Math.floor(random() * 10) + 1);
    const hasBeenSent = !["READY", "NOT_CONTACTED", "INVALID", "DUPLICATE"].includes(status);

    const record = await prisma.campaignInfluencer.create({
      data: {
        campaignId: campaign.id,
        influencerId: influencer.id,
        assigneeId: assignee?.id ?? null,
        outreachStatus: status as never,
        pipelineStatus: pipeline as never,
        priority: status === "FOLLOW_UP_DUE" ? 10 : 0,
        lastContactAt: hasBeenSent ? sentAt : null,
        quotedRate: pipeline === "NEGOTIATING" ? `PHP ${(Math.floor(random() * 6) + 4) * 1000}` : null,
        queueOpenedAt: hasBeenSent ? new Date(sentAt.getTime() - 90_000 - random() * 300_000) : null,
        lastCopiedAt: hasBeenSent ? new Date(sentAt.getTime() - 40_000) : null,
        lastProfileOpenAt: hasBeenSent ? new Date(sentAt.getTime() - 60_000) : null,
        dueAt: status === "FOLLOW_UP_DUE" ? daysAgo(1) : null,
      },
    });

    if (hasBeenSent && assignee) {
      const attempt = await prisma.outreachAttempt.create({
        data: {
          campaignInfluencerId: record.id,
          type: "FIRST_CONTACT",
          channel: "INSTAGRAM",
          templateVersionId: templateVersion.id,
          preparedText: DEFAULT_TEMPLATE_CONTENT,
          confirmedSentText: `Hi ${influencer.firstName},\n\nWe are QROAD, an influencer marketing agency supporting ABC Korean Restaurant in BGC, Taguig.`,
          outcome: "SENT",
          manualSendAffirmed: true,
          sentConfirmedAt: sentAt,
          createdAt: sentAt,
          createdById: assignee.id,
        },
      });

      const followUps = planFollowUps(sentAt, campaign.followUpOffsetDays);
      for (const followUp of followUps) {
        const replied = ["REPLIED", "INTERESTED", "NEGOTIATING", "CONFIRMED", "DECLINED"].includes(
          status,
        );
        await prisma.followUpTask.create({
          data: {
            campaignInfluencerId: record.id,
            attemptId: attempt.id,
            sequence: followUp.sequence,
            dueAt: followUp.dueAt,
            assignedToId: assignee.id,
            status: replied ? "CANCELLED" : followUp.sequence === 1 ? "COMPLETED" : "PENDING",
            completedAt: !replied && followUp.sequence === 1 ? daysAgo(1) : null,
            cancelledAt: replied ? sentAt : null,
            cancelReason: replied ? "Reply received" : null,
          },
        });
      }

      await prisma.auditLog.create({
        data: {
          actorId: assignee.id,
          actorEmail: userSpecs.find((u) => u.name === assignee.name)?.email ?? null,
          action: "outreach.outcome",
          entity: "campaign_influencer",
          entityId: record.id,
          campaignId: campaign.id,
          oldValues: { outreachStatus: "READY" },
          newValues: { outreachStatus: "SENT", outcome: "SENT", channel: "INSTAGRAM" },
          createdAt: sentAt,
        },
      });
    }
  }

  // A small draft-campaign audience so the second campaign is not empty.
  for (const entry of audience.slice(0, 8)) {
    await prisma.campaignInfluencer.create({
      data: {
        campaignId: secondCampaign.id,
        influencerId: entry.influencerId,
        outreachStatus: "NOT_CONTACTED",
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      actorId: manager.id,
      actorEmail: "manager@qroad.test",
      action: "campaign.activate",
      entity: "campaign",
      entityId: campaign.id,
      campaignId: campaign.id,
      newValues: { status: "ACTIVE" },
      createdAt: daysAgo(14),
    },
  });

  log("\nDemo sign-in accounts (all use the same password):");
  for (const spec of userSpecs) log(`  ${spec.roleKey.padEnd(17)} ${spec.email}`);
  log(`  password: ${demoPassword}\n`);
  return summarize(prisma, log);
}

async function summarize(
  prisma: PrismaClient,
  log: (message: string) => void,
): Promise<DemoSeedSummary> {
  const [influencers, records, campaigns, followUps] = await Promise.all([
    prisma.influencer.count(),
    prisma.campaignInfluencer.count(),
    prisma.campaign.count(),
    prisma.followUpTask.count(),
  ]);
  log(
    `Seeded: ${campaigns} campaigns, ${influencers} influencers, ${records} campaign records, ${followUps} follow-up tasks.`,
  );
  return { campaigns, influencers, records, followUps };
}
