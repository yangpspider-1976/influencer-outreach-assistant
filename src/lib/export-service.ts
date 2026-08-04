import "server-only";
import { prisma } from "./db";
import { ApiError } from "./api";
import { AUDIT_ACTIONS, recordAudit } from "./audit";
import type { CurrentUser } from "./auth";
import { env } from "./env";
import { hasScope } from "./rbac";
import { putFile } from "./storage";
import { exportFileName, toCsv, toXlsx, type ExportColumn } from "./spreadsheet";
import { STATUS_META, type OutreachStatusKey } from "./status";
import { visibleCampaignFilter } from "./campaign-service";
import type { Prisma } from "@/generated/prisma/client";

/**
 * FR-026 / AC-011 — filtered CSV / XLSX export.
 *
 * Every cell passes through escapeSpreadsheetValue, so no exported value can be
 * evaluated as a formula (SEC-005).
 */

export type ExportEntity = "campaign_records" | "influencers" | "follow_ups" | "audit_logs";

export type ExportFilters = {
  campaignId?: string | null;
  status?: string | null;
  assigneeId?: string | null;
  channel?: string | null;
  category?: string | null;
  location?: string | null;
  search?: string | null;
  from?: string | null;
  to?: string | null;
};

function statusLabel(status: string): string {
  if (status === "NONE") return "";
  return STATUS_META[status as OutreachStatusKey]?.label ?? status;
}

function dateRange(filters: ExportFilters) {
  if (!filters.from && !filters.to) return undefined;
  return {
    ...(filters.from ? { gte: new Date(filters.from) } : {}),
    ...(filters.to ? { lte: new Date(filters.to) } : {}),
  };
}

export function campaignRecordWhere(
  user: CurrentUser,
  filters: ExportFilters,
): Prisma.CampaignInfluencerWhereInput {
  const createdAt = dateRange(filters);
  return {
    campaign: visibleCampaignFilter(user) as Prisma.CampaignWhereInput,
    ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
    ...(filters.status ? { outreachStatus: filters.status as never } : {}),
    ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(filters.search || filters.category || filters.location || filters.channel
      ? {
          influencer: {
            ...(filters.category
              ? { category: { contains: filters.category, mode: "insensitive" as const } }
              : {}),
            ...(filters.location
              ? { location: { contains: filters.location, mode: "insensitive" as const } }
              : {}),
            ...(filters.channel
              ? { profiles: { some: { platform: filters.channel as never } } }
              : {}),
            ...(filters.search
              ? {
                  OR: [
                    { displayName: { contains: filters.search, mode: "insensitive" as const } },
                    { email: { contains: filters.search, mode: "insensitive" as const } },
                    {
                      profiles: {
                        some: {
                          normalizedUrl: {
                            contains: filters.search.toLowerCase(),
                          },
                        },
                      },
                    },
                  ],
                }
              : {}),
          },
        }
      : {}),
  };
}

type CampaignRecordRow = Prisma.CampaignInfluencerGetPayload<{
  include: {
    campaign: { include: { client: true } };
    influencer: { include: { profiles: true; tags: { include: { tag: true } } } };
    assignee: true;
    attempts: true;
  };
}>;

const CAMPAIGN_RECORD_COLUMNS: ExportColumn<CampaignRecordRow>[] = [
  { key: "campaign", header: "Campaign", value: (r) => r.campaign.name },
  { key: "client", header: "Client", value: (r) => r.campaign.client.name },
  { key: "influencer", header: "Influencer", value: (r) => r.influencer.displayName },
  { key: "first_name", header: "First name", value: (r) => r.influencer.firstName ?? "" },
  {
    key: "instagram",
    header: "Instagram URL",
    value: (r) => r.influencer.profiles.find((p) => p.platform === "INSTAGRAM")?.originalUrl ?? "",
  },
  {
    key: "facebook",
    header: "Facebook URL",
    value: (r) => r.influencer.profiles.find((p) => p.platform === "FACEBOOK")?.originalUrl ?? "",
  },
  {
    key: "tiktok",
    header: "TikTok URL",
    value: (r) => r.influencer.profiles.find((p) => p.platform === "TIKTOK")?.originalUrl ?? "",
  },
  {
    key: "youtube",
    header: "YouTube URL",
    value: (r) => r.influencer.profiles.find((p) => p.platform === "YOUTUBE")?.originalUrl ?? "",
  },
  { key: "category", header: "Category", value: (r) => r.influencer.category },
  { key: "location", header: "Location", value: (r) => r.influencer.location },
  { key: "followers", header: "Followers (supplied)", value: (r) => r.influencer.followerCountRaw ?? "" },
  { key: "status", header: "Outreach status", value: (r) => statusLabel(r.outreachStatus) },
  { key: "pipeline", header: "Pipeline stage", value: (r) => statusLabel(r.pipelineStatus) },
  { key: "assignee", header: "Assigned operator", value: (r) => r.assignee?.name ?? "" },
  { key: "priority", header: "Priority", value: (r) => r.priority },
  {
    key: "sent_at",
    header: "Sent confirmed at",
    value: (r) => r.attempts.find((a) => a.outcome === "SENT")?.sentConfirmedAt ?? "",
  },
  { key: "last_contact", header: "Last contact", value: (r) => r.lastContactAt ?? "" },
  { key: "due_at", header: "Follow-up due", value: (r) => r.dueAt ?? "" },
  { key: "quoted_rate", header: "Quoted rate", value: (r) => r.quotedRate ?? "" },
  { key: "dnc", header: "Do not contact", value: (r) => (r.influencer.dncFlag ? "Yes" : "No") },
  { key: "tags", header: "Tags", value: (r) => r.influencer.tags.map((t) => t.tag.name).join("; ") },
  { key: "email", header: "Email", value: (r) => r.influencer.email ?? "" },
  // Both note fields matter: the creator's standing notes and the note the
  // operator recorded against this specific campaign record.
  { key: "influencer_notes", header: "Influencer notes", value: (r) => r.influencer.notes },
  { key: "record_notes", header: "Campaign record notes", value: (r) => r.notes },
];

type InfluencerRow = Prisma.InfluencerGetPayload<{
  include: { profiles: true; tags: { include: { tag: true } } };
}>;

const INFLUENCER_COLUMNS: ExportColumn<InfluencerRow>[] = [
  { key: "influencer_name", header: "Influencer name", value: (r) => r.displayName },
  { key: "first_name", header: "First name", value: (r) => r.firstName ?? "" },
  {
    key: "instagram_url",
    header: "Instagram URL",
    value: (r) => r.profiles.find((p) => p.platform === "INSTAGRAM")?.originalUrl ?? "",
  },
  {
    key: "facebook_url",
    header: "Facebook URL",
    value: (r) => r.profiles.find((p) => p.platform === "FACEBOOK")?.originalUrl ?? "",
  },
  {
    key: "tiktok_url",
    header: "TikTok URL",
    value: (r) => r.profiles.find((p) => p.platform === "TIKTOK")?.originalUrl ?? "",
  },
  {
    key: "youtube_url",
    header: "YouTube URL",
    value: (r) => r.profiles.find((p) => p.platform === "YOUTUBE")?.originalUrl ?? "",
  },
  {
    key: "preferred_channel",
    header: "Preferred channel",
    value: (r) => r.profiles.find((p) => p.preferredFlag)?.platform ?? "",
  },
  { key: "category", header: "Category", value: (r) => r.category },
  { key: "location", header: "Location", value: (r) => r.location },
  { key: "followers", header: "Followers (supplied)", value: (r) => r.followerCountRaw ?? "" },
  { key: "email", header: "Email", value: (r) => r.email ?? "" },
  { key: "phone", header: "Phone", value: (r) => r.phone ?? "" },
  { key: "expected_rate", header: "Expected rate", value: (r) => r.rate ?? "" },
  { key: "dnc", header: "Do not contact", value: (r) => (r.dncFlag ? "Yes" : "No") },
  { key: "dnc_reason", header: "Do-not-contact reason", value: (r) => r.dncReason ?? "" },
  { key: "tags", header: "Tags", value: (r) => r.tags.map((t) => t.tag.name).join("; ") },
  { key: "notes", header: "Notes", value: (r) => r.notes },
];

async function collect(
  user: CurrentUser,
  entity: ExportEntity,
  filters: ExportFilters,
): Promise<{ rows: unknown[]; columns: ExportColumn<never>[]; sheet: string }> {
  switch (entity) {
    case "campaign_records": {
      const rows = await prisma.campaignInfluencer.findMany({
        where: campaignRecordWhere(user, filters),
        orderBy: [{ campaignId: "asc" }, { createdAt: "asc" }],
        include: {
          campaign: { include: { client: true } },
          influencer: { include: { profiles: true, tags: { include: { tag: true } } } },
          assignee: true,
          attempts: true,
        },
      });
      return {
        rows,
        columns: CAMPAIGN_RECORD_COLUMNS as unknown as ExportColumn<never>[],
        sheet: "Campaign records",
      };
    }
    case "influencers": {
      const rows = await prisma.influencer.findMany({
        where: {
          archivedAt: null,
          // Never export the demo dataset — only real, user-entered creators.
          // (Production data never carries the demo flag.)
          isDemo: false,
          ...(filters.category
            ? { category: { contains: filters.category, mode: "insensitive" } }
            : {}),
          ...(filters.location
            ? { location: { contains: filters.location, mode: "insensitive" } }
            : {}),
          ...(filters.search
            ? { displayName: { contains: filters.search, mode: "insensitive" } }
            : {}),
        },
        orderBy: { displayName: "asc" },
        include: { profiles: true, tags: { include: { tag: true } } },
      });
      return {
        rows,
        columns: INFLUENCER_COLUMNS as unknown as ExportColumn<never>[],
        sheet: "Influencers",
      };
    }
    case "follow_ups": {
      const rows = await prisma.followUpTask.findMany({
        where: {
          ...(filters.campaignId ? { campaignInfluencer: { campaignId: filters.campaignId } } : {}),
          ...(filters.assigneeId ? { assignedToId: filters.assigneeId } : {}),
        },
        orderBy: { dueAt: "asc" },
        include: {
          assignedTo: true,
          campaignInfluencer: {
            include: { campaign: { include: { client: true } }, influencer: true },
          },
        },
      });
      const columns: ExportColumn<(typeof rows)[number]>[] = [
        { key: "campaign", header: "Campaign", value: (r) => r.campaignInfluencer.campaign.name },
        { key: "client", header: "Client", value: (r) => r.campaignInfluencer.campaign.client.name },
        {
          key: "influencer",
          header: "Influencer",
          value: (r) => r.campaignInfluencer.influencer.displayName,
        },
        { key: "sequence", header: "Follow-up number", value: (r) => r.sequence },
        { key: "due_at", header: "Due", value: (r) => r.dueAt },
        { key: "status", header: "Status", value: (r) => r.status },
        { key: "assigned_to", header: "Assigned to", value: (r) => r.assignedTo?.name ?? "" },
        { key: "completed_at", header: "Completed", value: (r) => r.completedAt ?? "" },
        { key: "cancel_reason", header: "Cancel reason", value: (r) => r.cancelReason ?? "" },
      ];
      return { rows, columns: columns as unknown as ExportColumn<never>[], sheet: "Follow-ups" };
    }
    case "audit_logs": {
      if (!hasScope(user.permissions, "audit_view", "campaign")) {
        throw new ApiError(403, "Your role cannot export audit logs.", "FORBIDDEN");
      }
      const createdAt = dateRange(filters);
      const rows = await prisma.auditLog.findMany({
        where: {
          ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
          ...(createdAt ? { createdAt } : {}),
          ...(hasScope(user.permissions, "audit_view", "all") ? {} : { actorId: user.id }),
        },
        orderBy: { createdAt: "desc" },
        take: 20000,
      });
      const columns: ExportColumn<(typeof rows)[number]>[] = [
        { key: "created_at", header: "Timestamp", value: (r) => r.createdAt },
        { key: "actor", header: "Actor", value: (r) => r.actorEmail ?? "" },
        { key: "action", header: "Action", value: (r) => r.action },
        { key: "entity", header: "Entity", value: (r) => r.entity },
        { key: "entity_id", header: "Entity id", value: (r) => r.entityId ?? "" },
        { key: "old", header: "Previous value", value: (r) => JSON.stringify(r.oldValues ?? null) },
        { key: "new", header: "New value", value: (r) => JSON.stringify(r.newValues ?? null) },
        { key: "ip", header: "IP address", value: (r) => r.ipAddress ?? "" },
        { key: "session", header: "Session", value: (r) => r.sessionId ?? "" },
      ];
      return { rows, columns: columns as unknown as ExportColumn<never>[], sheet: "Audit log" };
    }
    default:
      throw new ApiError(400, "Unknown export entity.", "UNKNOWN_ENTITY");
  }
}

export async function createExport(
  user: CurrentUser,
  entity: ExportEntity,
  format: "CSV" | "XLSX",
  filters: ExportFilters,
) {
  const job = await prisma.exportJob.create({
    data: { requestedById: user.id, entity, format, filters: filters as object, status: "PROCESSING" },
  });

  await recordAudit({
    actor: user,
    action: AUDIT_ACTIONS.EXPORT_CREATE,
    entity: "export_job",
    entityId: job.id,
    campaignId: filters.campaignId ?? null,
    newValues: { entity, format, filters },
  });

  try {
    const { rows, columns, sheet } = await collect(user, entity, filters);

    // §18 — beyond the synchronous limit the job stays queued and the UI polls
    // its status instead of blocking the request.
    if (rows.length > env.exportSyncRowLimit) {
      await prisma.exportJob.update({
        where: { id: job.id },
        data: { status: "PENDING", rowCount: rows.length },
      });
      void processQueuedExport(job.id, rows, columns, sheet, entity, format);
      return { job: await prisma.exportJob.findUniqueOrThrow({ where: { id: job.id } }), queued: true };
    }

    const fileName = exportFileName(entity, format);
    const buffer =
      format === "CSV"
        ? Buffer.from(toCsv(rows as never[], columns), "utf8")
        : await toXlsx(rows as never[], columns, sheet);
    const storedFileKey = await putFile("exports", fileName, buffer);

    const completed = await prisma.exportJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        rowCount: rows.length,
        storedFileKey,
        fileName,
        completedAt: new Date(),
      },
    });
    return { job: completed, queued: false };
  } catch (error) {
    await prisma.exportJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Export failed.",
      },
    });
    throw error;
  }
}

async function processQueuedExport(
  jobId: string,
  rows: unknown[],
  columns: ExportColumn<never>[],
  sheet: string,
  entity: string,
  format: "CSV" | "XLSX",
) {
  try {
    const fileName = exportFileName(entity, format);
    const buffer =
      format === "CSV"
        ? Buffer.from(toCsv(rows as never[], columns), "utf8")
        : await toXlsx(rows as never[], columns, sheet);
    const storedFileKey = await putFile("exports", fileName, buffer);
    await prisma.exportJob.update({
      where: { id: jobId },
      data: { status: "COMPLETED", storedFileKey, fileName, completedAt: new Date() },
    });
  } catch (error) {
    await prisma.exportJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Export failed.",
      },
    });
  }
}
