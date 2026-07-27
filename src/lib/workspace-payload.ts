import "server-only";
import { prisma } from "./db";
import {
  loadInfluencerHistory,
  renderForRecord,
  type WorkspaceRecord,
} from "./outreach-service";
import { formatDateRange } from "./format";

/**
 * The single payload the Outreach Workspace renders from (§12).
 * Everything the operator needs for one task, and nothing else.
 */
export type WorkspacePayload = Awaited<ReturnType<typeof buildWorkspacePayload>>;

export async function buildWorkspacePayload(record: WorkspaceRecord) {
  const rendered = renderForRecord(record);
  const [history, skipReasons, disclaimer] = await Promise.all([
    loadInfluencerHistory(record.influencerId, record.id),
    prisma.skipReason.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.appSetting.findUnique({ where: { key: "outreach.disclaimer" } }),
  ]);

  const preferred =
    record.influencer.profiles.find((profile) => profile.preferredFlag) ??
    record.influencer.profiles[0] ??
    null;

  return {
    record: {
      id: record.id,
      version: record.version,
      outreachStatus: record.outreachStatus,
      pipelineStatus: record.pipelineStatus,
      priority: record.priority,
      dueAt: record.dueAt,
      notes: record.notes,
      draftMessage: record.draftMessage,
      lastContactAt: record.lastContactAt,
      lastCopiedAt: record.lastCopiedAt,
      lastProfileOpenAt: record.lastProfileOpenAt,
      queueOpenedAt: record.queueOpenedAt,
      quotedRate: record.quotedRate,
      dncOverrideAt: record.dncOverrideAt,
      dncOverrideReason: record.dncOverrideReason,
      assignee: record.assignee
        ? { id: record.assignee.id, name: record.assignee.name }
        : null,
    },
    campaign: {
      id: record.campaign.id,
      name: record.campaign.name,
      status: record.campaign.status,
      client: record.campaign.client.name,
      location: record.campaign.location,
      visitPeriod: formatDateRange(record.campaign.visitStart, record.campaign.visitEnd),
      deliverables: record.campaign.deliverables,
      compensation: record.campaign.compensation,
      applicationDeadline: record.campaign.applicationDeadline,
      notes: record.campaign.notes,
      owner: record.campaign.owner?.name ?? null,
      followUpOffsetDays: record.campaign.followUpOffsetDays,
      templateName: rendered.templateName,
    },
    influencer: {
      id: record.influencer.id,
      displayName: record.influencer.displayName,
      firstName: record.influencer.firstName,
      category: record.influencer.category,
      location: record.influencer.location,
      followerCountRaw: record.influencer.followerCountRaw,
      followerCountNumeric: record.influencer.followerCountNumeric,
      email: record.influencer.email,
      rate: record.influencer.rate,
      notes: record.influencer.notes,
      dncFlag: record.influencer.dncFlag,
      dncReason: record.influencer.dncReason,
      tags: record.influencer.tags.map((link) => link.tag.name),
      preferredPlatform: preferred?.platform ?? null,
      profiles: record.influencer.profiles.map((profile) => ({
        id: profile.id,
        platform: profile.platform,
        url: profile.originalUrl,
        normalizedUrl: profile.normalizedUrl,
        usernameHint: profile.usernameHint,
        preferred: profile.preferredFlag,
        validity: profile.validityStatus,
      })),
    },
    message: {
      text: record.draftMessage ?? rendered.text,
      renderedText: rendered.text,
      unresolvedRequired: rendered.unresolvedRequired,
      unknownTokens: rendered.unknownTokens,
      tokens: rendered.tokens,
    },
    attempts: record.attempts.map((attempt) => ({
      id: attempt.id,
      type: attempt.type,
      outcome: attempt.outcome,
      channel: attempt.channel,
      note: attempt.note,
      skipReason: attempt.skipReason?.label ?? null,
      confirmedSentText: attempt.confirmedSentText,
      sentConfirmedAt: attempt.sentConfirmedAt,
      createdAt: attempt.createdAt,
      createdBy: attempt.createdBy.name,
    })),
    followUps: record.followUpTasks.map((task) => ({
      id: task.id,
      sequence: task.sequence,
      dueAt: task.dueAt,
      status: task.status,
      completedAt: task.completedAt,
      cancelReason: task.cancelReason,
    })),
    history: history.map((entry) => ({
      id: entry.id,
      campaignId: entry.campaign.id,
      campaignName: entry.campaign.name,
      client: entry.campaign.client.name,
      campaignStatus: entry.campaign.status,
      outreachStatus: entry.outreachStatus,
      updatedAt: entry.updatedAt,
      attempts: entry.attempts,
    })),
    skipReasons: skipReasons.map((reason) => ({ id: reason.id, label: reason.label })),
    disclaimer:
      (disclaimer?.value as string | undefined) ??
      "You are responsible for verifying the recipient and message before sending.",
  };
}
