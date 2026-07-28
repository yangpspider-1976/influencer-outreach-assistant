import "server-only";
import { prisma } from "./db";
import { ApiError } from "./api";
import { AUDIT_ACTIONS, recordAudit } from "./audit";
import type { CurrentUser } from "./auth";
import { getFile } from "./storage";
import { parseUpload } from "./import-parse";
import {
  type ColumnMapping,
  type RowIssue,
  type ValidatedRow,
  classify,
  validateRow,
} from "./import-fields";
import type { SocialPlatform } from "./social-url";

/**
 * §8 — validation pass and transactional commit.
 *
 * The pure per-row rules live in import-fields.ts; this module adds the checks
 * that need the database (existing influencer, do-not-contact, already in the
 * campaign) and performs the commit.
 */

export type EnrichedRow = ValidatedRow & {
  id?: string;
  matchedInfluencerId: string | null;
  matchedInfluencerName: string | null;
  blockedByDnc: boolean;
  alreadyInCampaign: boolean;
};

export async function runValidation(importId: string, mapping: ColumnMapping): Promise<void> {
  const record = await prisma.import.findUnique({ where: { id: importId } });
  if (!record) throw new ApiError(404, "Import session not found.", "NOT_FOUND");

  const data = await getFile(record.storedFileKey);
  const parsed = await parseUpload(record.originalFileName, data, record.sheetName);

  const seen = new Set<string>();
  const validated = parsed.rows.map((raw, index) =>
    validateRow(index + 2, raw, mapping, seen),
  );

  const enriched = await enrichRows(validated, record.campaignId);

  await prisma.$transaction(async (tx) => {
    await tx.importRow.deleteMany({ where: { importId } });
    if (enriched.length > 0) {
      await tx.importRow.createMany({
        data: enriched.map((row) => ({
          importId,
          rowNumber: row.rowNumber,
          rawData: row.raw,
          normalizedData: JSON.parse(JSON.stringify(row.normalized)),
          status: row.status,
          issues: JSON.parse(JSON.stringify(row.issues)),
          selected: row.selected,
          influencerId: row.matchedInfluencerId,
        })),
      });
    }
    await tx.import.update({
      where: { id: importId },
      data: {
        mapping: mapping as object,
        headers: parsed.headers,
        status: "VALIDATED",
        totalRows: enriched.length,
        validRows: enriched.filter((row) => row.status === "VALID").length,
        warningRows: enriched.filter((row) => row.status === "WARNING").length,
        rejectedRows: enriched.filter((row) => row.status === "REJECTED").length,
      },
    });
  });
}

/** Adds the database-dependent §8 conditions to each parsed row. */
export async function enrichRows(
  rows: ValidatedRow[],
  campaignId: string | null,
): Promise<EnrichedRow[]> {
  const allUrls = rows.flatMap((row) => row.normalized.profiles.map((p) => p.normalizedUrl));

  const existingProfiles = allUrls.length
    ? await prisma.socialProfile.findMany({
        where: { normalizedUrl: { in: [...new Set(allUrls)] } },
        include: {
          influencer: { select: { id: true, displayName: true, dncFlag: true, dncReason: true } },
        },
      })
    : [];

  const byUrl = new Map(existingProfiles.map((profile) => [profile.normalizedUrl, profile]));

  const influencerIds = [...new Set(existingProfiles.map((p) => p.influencerId))];
  const inCampaign =
    campaignId && influencerIds.length
      ? await prisma.campaignInfluencer.findMany({
          where: { campaignId, influencerId: { in: influencerIds } },
          select: { influencerId: true },
        })
      : [];
  const inCampaignSet = new Set(inCampaign.map((row) => row.influencerId));

  return rows.map((row) => {
    const issues: RowIssue[] = [...row.issues];
    let matchedInfluencerId: string | null = null;
    let matchedInfluencerName: string | null = null;
    let blockedByDnc = false;
    let alreadyInCampaign = false;

    for (const profile of row.normalized.profiles) {
      const existing = byUrl.get(profile.normalizedUrl);
      if (!existing) continue;

      // §8 — "Existing influencer with same normalized profile URL: link to
      // existing record; do not create a duplicate." (AC-003)
      matchedInfluencerId = existing.influencerId;
      matchedInfluencerName = existing.influencer.displayName;
      issues.push({
        field:
          profile.platform === "INSTAGRAM"
            ? "instagram_url"
            : profile.platform === "FACEBOOK"
              ? "facebook_url"
              : profile.platform === "TIKTOK"
                ? "tiktok_url"
                : "youtube_url",
        code: "LINKED_EXISTING",
        message: `Matched the existing influencer "${existing.influencer.displayName}"; no duplicate will be created.`,
        severity: "info",
      });

      if (existing.influencer.dncFlag) {
        blockedByDnc = true;
        issues.push({
          field: "row",
          code: "DNC_BLOCKED",
          message: `"${existing.influencer.displayName}" is flagged Do Not Contact${
            existing.influencer.dncReason ? ` (${existing.influencer.dncReason})` : ""
          } and cannot be added to outreach.`,
          severity: "error",
        });
      }
      if (inCampaignSet.has(existing.influencerId)) {
        alreadyInCampaign = true;
        issues.push({
          field: "row",
          code: "ALREADY_IN_CAMPAIGN",
          message: "This creator is already part of the campaign and will not be added again.",
          severity: "warning",
        });
      }
      break;
    }

    const status = classify(issues);
    return {
      ...row,
      issues,
      status,
      // Duplicates and blocked rows are pre-deselected (§8).
      selected: status !== "REJECTED" && !alreadyInCampaign && row.selected,
      matchedInfluencerId,
      matchedInfluencerName,
      blockedByDnc,
      alreadyInCampaign,
    };
  });
}

export type CommitResult = {
  imported: number;
  created: number;
  linked: number;
  addedToCampaign: number;
  skipped: number;
};

/**
 * §8 — "Confirmed rows are imported in a transaction; a fatal error must not
 * leave a partial unreported import."
 */
export async function commitImport(
  importId: string,
  selectedRowIds: string[],
  actor: CurrentUser,
): Promise<CommitResult> {
  const record = await prisma.import.findUnique({ where: { id: importId } });
  if (!record) throw new ApiError(404, "Import session not found.", "NOT_FOUND");
  if (record.status === "COMMITTED") {
    throw new ApiError(409, "This import has already been committed.", "ALREADY_COMMITTED");
  }

  const rows = await prisma.importRow.findMany({
    where: { importId, id: { in: selectedRowIds }, status: { in: ["VALID", "WARNING"] } },
    orderBy: { rowNumber: "asc" },
  });
  if (rows.length === 0) {
    throw new ApiError(400, "No importable rows were selected.", "NO_ROWS_SELECTED");
  }

  const result: CommitResult = {
    imported: 0,
    created: 0,
    linked: 0,
    addedToCampaign: 0,
    skipped: 0,
  };

  try {
    await prisma.$transaction(
      async (tx) => {
        for (const row of rows) {
          const normalized = row.normalizedData as unknown as {
            displayName: string;
            firstName: string | null;
            category: string;
            location: string;
            followerCountRaw: string | null;
            followerCountNumeric: number | null;
            email: string | null;
            phone: string | null;
            rate: string | null;
            notes: string;
            tags: string[];
            preferredChannel: SocialPlatform | null;
            profiles: {
              platform: SocialPlatform;
              originalUrl: string;
              normalizedUrl: string;
              usernameHint: string | null;
            }[];
          };

          // Re-check inside the transaction so concurrent imports cannot both
          // create the same influencer (FR-011).
          let influencerId: string | null = null;
          for (const profile of normalized.profiles) {
            const existing = await tx.socialProfile.findUnique({
              where: {
                platform_normalizedUrl: {
                  platform: profile.platform,
                  normalizedUrl: profile.normalizedUrl,
                },
              },
              select: { influencerId: true, influencer: { select: { dncFlag: true } } },
            });
            if (existing) {
              // FR-027 — a do-not-contact creator never enters an audience.
              if (existing.influencer.dncFlag) {
                influencerId = null;
                break;
              }
              influencerId = existing.influencerId;
              break;
            }
          }

          if (influencerId === null && normalized.profiles.length > 0) {
            const dncCheck = await tx.socialProfile.findFirst({
              where: {
                normalizedUrl: { in: normalized.profiles.map((p) => p.normalizedUrl) },
                influencer: { dncFlag: true },
              },
            });
            if (dncCheck) {
              await tx.importRow.update({
                where: { id: row.id },
                data: { status: "SKIPPED" },
              });
              result.skipped += 1;
              continue;
            }
          }

          if (influencerId) {
            result.linked += 1;
            await tx.influencer.update({
              where: { id: influencerId },
              data: {
                // Only fill blanks — never overwrite curated database values.
                firstName: normalized.firstName ?? undefined,
                category: normalized.category || undefined,
                location: normalized.location || undefined,
                followerCountRaw: normalized.followerCountRaw ?? undefined,
                followerCountNumeric: normalized.followerCountNumeric ?? undefined,
                email: normalized.email ?? undefined,
                phone: normalized.phone ?? undefined,
                rate: normalized.rate ?? undefined,
              },
            });
          } else {
            const created = await tx.influencer.create({
              data: {
                displayName: normalized.displayName,
                firstName: normalized.firstName,
                category: normalized.category,
                location: normalized.location,
                followerCountRaw: normalized.followerCountRaw,
                followerCountNumeric: normalized.followerCountNumeric,
                email: normalized.email,
                phone: normalized.phone,
                rate: normalized.rate,
                notes: normalized.notes,
              },
            });
            influencerId = created.id;
            result.created += 1;
          }

          for (const profile of normalized.profiles) {
            await tx.socialProfile.upsert({
              where: {
                platform_normalizedUrl: {
                  platform: profile.platform,
                  normalizedUrl: profile.normalizedUrl,
                },
              },
              update: {
                preferredFlag: normalized.preferredChannel === profile.platform,
              },
              create: {
                influencerId,
                platform: profile.platform,
                originalUrl: profile.originalUrl,
                normalizedUrl: profile.normalizedUrl,
                usernameHint: profile.usernameHint,
                preferredFlag: normalized.preferredChannel === profile.platform,
              },
            });
          }

          for (const tagName of normalized.tags) {
            const tag = await tx.tag.upsert({
              where: { name: tagName },
              update: {},
              create: { name: tagName },
            });
            await tx.influencerTag.upsert({
              where: { influencerId_tagId: { influencerId, tagId: tag.id } },
              update: {},
              create: { influencerId, tagId: tag.id },
            });
          }

          let campaignInfluencerId: string | null = null;
          if (record.campaignId) {
            const existingRecord = await tx.campaignInfluencer.findUnique({
              where: {
                campaignId_influencerId: { campaignId: record.campaignId, influencerId },
              },
            });
            if (existingRecord) {
              campaignInfluencerId = existingRecord.id;
            } else if (normalized.profiles.length > 0) {
              // §8 — creators without a Meta profile stay in the database only.
              const created = await tx.campaignInfluencer.create({
                data: {
                  campaignId: record.campaignId,
                  influencerId,
                  outreachStatus: "NOT_CONTACTED",
                },
              });
              campaignInfluencerId = created.id;
              result.addedToCampaign += 1;
            }
          }

          await tx.importRow.update({
            where: { id: row.id },
            data: { status: "IMPORTED", influencerId, campaignInfluencerId },
          });
          result.imported += 1;
        }

        await tx.import.update({
          where: { id: importId },
          data: {
            status: "COMMITTED",
            committedAt: new Date(),
            importedRows: result.imported,
            createdCount: result.created,
            linkedExisting: result.linked,
          },
        });
      },
      { timeout: 120_000, maxWait: 15_000 },
    );
  } catch (error) {
    await prisma.import.update({
      where: { id: importId },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Unknown import failure.",
      },
    });
    throw new ApiError(
      500,
      "The import was rolled back and no rows were saved. Review the file and try again.",
      "IMPORT_ROLLED_BACK",
    );
  }

  await recordAudit({
    actor,
    action: AUDIT_ACTIONS.IMPORT_COMMIT,
    entity: "import",
    entityId: importId,
    campaignId: record.campaignId,
    newValues: { ...result, fileName: record.originalFileName },
  });

  return result;
}
