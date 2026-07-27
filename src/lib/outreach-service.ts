import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./db";
import { ApiError, ConflictError } from "./api";
import { AUDIT_ACTIONS, recordAudit } from "./audit";
import { ForbiddenError, type CurrentUser } from "./auth";
import { canAccessRecord, hasScope } from "./rbac";
import { formatDateRange, formatDate } from "./format";
import {
  DEFAULT_TEMPLATE_CONTENT,
  findUnresolvedTokens,
  renderTemplate,
  type RenderResult,
  type TemplateContext,
} from "./template";
import {
  QUEUE_ELIGIBLE_STATUSES,
  canTransition,
  pipelineLaneFor,
  type OutreachStatusKey,
} from "./status";
import { planFollowUps, shouldCancelFollowUps } from "./follow-up";

/** §10 Concurrency — how long a processing lock is honoured. */
export const RECORD_LOCK_TTL_MS = 15 * 60 * 1000;

const ORG_NAME = "QROAD Influencer Marketing Team";

export type WorkspaceRecord = Prisma.CampaignInfluencerGetPayload<{
  include: {
    campaign: { include: { client: true; owner: true; templateVersion: true } };
    influencer: { include: { profiles: true; tags: { include: { tag: true } } } };
    assignee: true;
    attempts: { include: { createdBy: true; skipReason: true } };
    followUpTasks: true;
  };
}>;

export function buildTemplateContext(record: WorkspaceRecord): TemplateContext {
  const { campaign, influencer } = record;
  return {
    first_name: influencer.firstName || influencer.displayName,
    influencer_name: influencer.displayName,
    restaurant_name: campaign.client.name,
    campaign_location: campaign.location,
    visit_period: formatDateRange(campaign.visitStart, campaign.visitEnd),
    deliverables: campaign.deliverablesShort || campaign.deliverables,
    compensation: campaign.compensation,
    application_deadline: campaign.applicationDeadline
      ? formatDate(campaign.applicationDeadline)
      : null,
    campaign_manager_name: campaign.owner?.name || ORG_NAME,
    // §9 — omitted unless the campaign explicitly authorizes brief links.
    brief_link: campaign.briefLinkEnabled ? campaign.briefUrl : null,
  };
}

export function renderForRecord(record: WorkspaceRecord): RenderResult & { templateName: string } {
  const version = record.campaign.templateVersion;
  const content = version?.content ?? DEFAULT_TEMPLATE_CONTENT;
  const rendered = renderTemplate(content, buildTemplateContext(record));
  return { ...rendered, templateName: version ? `v${version.version}` : "Built-in default" };
}

const workspaceInclude = {
  campaign: { include: { client: true, owner: true, templateVersion: true } },
  influencer: { include: { profiles: true, tags: { include: { tag: true } } } },
  assignee: true,
  attempts: {
    include: { createdBy: true, skipReason: true },
    orderBy: { createdAt: "desc" as const },
  },
  followUpTasks: { orderBy: { dueAt: "asc" as const } },
} satisfies Prisma.CampaignInfluencerInclude;

/**
 * §10 Eligibility — campaign Active, status Ready or Follow-up Due, assigned to
 * the caller, not DNC, and not locked by another active session.
 */
export function queueWhere(userId: string, campaignId?: string | null): Prisma.CampaignInfluencerWhereInput {
  return {
    campaign: { status: "ACTIVE", ...(campaignId ? { id: campaignId } : {}) },
    outreachStatus: { in: QUEUE_ELIGIBLE_STATUSES },
    assigneeId: userId,
    // FR-027 / AC-004 — a DNC creator only appears after a logged override.
    OR: [{ influencer: { dncFlag: false } }, { dncOverrideById: { not: null } }],
    AND: [
      {
        OR: [
          { lockedById: null },
          { lockedById: userId },
          { lockedAt: { lt: new Date(Date.now() - RECORD_LOCK_TTL_MS) } },
        ],
      },
    ],
  };
}

/** §10 Ordering — priority desc, due date asc, then creation timestamp asc. */
export const queueOrderBy: Prisma.CampaignInfluencerOrderByWithRelationInput[] = [
  { priority: "desc" },
  { dueAt: "asc" },
  { createdAt: "asc" },
];

export async function loadNextQueueRecord(
  user: CurrentUser,
  campaignId?: string | null,
  excludeId?: string | null,
): Promise<WorkspaceRecord | null> {
  return prisma.campaignInfluencer.findFirst({
    where: {
      ...queueWhere(user.id, campaignId),
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    orderBy: queueOrderBy,
    include: workspaceInclude,
  });
}

export async function loadWorkspaceRecord(
  user: CurrentUser,
  id: string,
): Promise<WorkspaceRecord> {
  const record = await prisma.campaignInfluencer.findUnique({
    where: { id },
    include: workspaceInclude,
  });
  if (!record) throw new ApiError(404, "Outreach record not found.", "NOT_FOUND");

  // SEC-004 — server-side campaign scoping on every workspace read.
  const allowed = canAccessRecord({ userId: user.id, permissions: user.permissions }, "outreach_process", {
    campaignOwnerId: record.campaign.ownerId,
    assigneeId: record.assigneeId,
  });
  if (!allowed) {
    throw new ForbiddenError("This outreach record is not assigned to you.");
  }
  return record;
}

/** Previous campaigns for the same creator (FR-023). */
export async function loadInfluencerHistory(influencerId: string, excludeRecordId: string) {
  return prisma.campaignInfluencer.findMany({
    where: { influencerId, id: { not: excludeRecordId } },
    orderBy: { updatedAt: "desc" },
    take: 25,
    include: {
      campaign: { select: { id: true, name: true, status: true, client: { select: { name: true } } } },
      attempts: {
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { id: true, outcome: true, createdAt: true, note: true, channel: true },
      },
    },
  });
}

/** Short processing lock so two operators cannot open the same record (§10). */
export async function acquireLock(recordId: string, userId: string): Promise<void> {
  const cutoff = new Date(Date.now() - RECORD_LOCK_TTL_MS);
  const updated = await prisma.campaignInfluencer.updateMany({
    where: {
      id: recordId,
      OR: [{ lockedById: null }, { lockedById: userId }, { lockedAt: { lt: cutoff } }],
    },
    data: { lockedById: userId, lockedAt: new Date(), queueOpenedAt: new Date() },
  });
  if (updated.count === 0) {
    throw new ApiError(
      423,
      "Another operator is currently working on this record.",
      "RECORD_LOCKED",
    );
  }
}

export async function releaseLock(recordId: string, userId: string): Promise<void> {
  await prisma.campaignInfluencer.updateMany({
    where: { id: recordId, lockedById: userId },
    data: { lockedById: null, lockedAt: null },
  });
}

export type OutcomeKind = "SENT" | "SKIPPED" | "INVALID" | "DUPLICATE" | "DO_NOT_CONTACT" | "SAVED_FOR_LATER";

export type OutcomeInput = {
  outcome: OutcomeKind;
  /** Optimistic concurrency token from the workspace payload (§10, §18). */
  version: number;
  channel?: "INSTAGRAM" | "FACEBOOK" | null;
  /** Exact text the operator confirms they sent (AC-007). */
  confirmedText?: string | null;
  preparedText: string;
  skipReasonId?: string | null;
  note?: string;
  manualSendAffirmed?: boolean;
  unresolvedAcknowledged?: boolean;
  dncReason?: string | null;
};

const OUTCOME_TO_STATUS: Record<OutcomeKind, OutreachStatusKey | null> = {
  SENT: "SENT",
  SKIPPED: null, // stays queue-eligible but is pushed behind other work
  INVALID: "INVALID",
  DUPLICATE: "DUPLICATE",
  DO_NOT_CONTACT: "DO_NOT_CONTACT",
  SAVED_FOR_LATER: null,
};

export type OutcomeResult = {
  recordId: string;
  newStatus: OutreachStatusKey;
  followUpsCreated: number;
  nextRecordId: string | null;
};

/**
 * FR-019 / AC-006 / AC-007 — records an operator-confirmed outcome.
 * Nothing in this function contacts Facebook or Instagram (§16).
 */
export async function saveOutcome(
  user: CurrentUser,
  recordId: string,
  input: OutcomeInput,
): Promise<OutcomeResult> {
  const record = await loadWorkspaceRecord(user, recordId);

  if (input.outcome === "SENT") {
    if (!input.channel) {
      throw new ApiError(422, "Select the channel the message was sent on.", "CHANNEL_REQUIRED");
    }
    if (!input.confirmedText || input.confirmedText.trim().length === 0) {
      throw new ApiError(
        422,
        "The exact message text is required before a record can be marked Sent.",
        "MESSAGE_REQUIRED",
      );
    }
    if (!input.manualSendAffirmed) {
      throw new ApiError(
        422,
        'Confirm "I manually sent this message" before saving.',
        "MANUAL_SEND_NOT_AFFIRMED",
      );
    }
    // §9 / AC — unresolved variables need an explicit acknowledgement.
    const unresolved = findUnresolvedTokens(input.confirmedText);
    if (unresolved.length > 0 && !input.unresolvedAcknowledged) {
      throw new ApiError(
        422,
        `The message still contains unresolved variables: ${unresolved
          .map((token) => `{{${token}}}`)
          .join(", ")}. Resolve them or confirm explicitly.`,
        "UNRESOLVED_VARIABLES",
        { unresolved },
      );
    }
    if (record.influencer.dncFlag && !record.dncOverrideById) {
      throw new ForbiddenError(
        "This creator is flagged Do Not Contact. An administrator override is required.",
      );
    }
  }

  if (input.outcome === "SKIPPED" && !input.skipReasonId) {
    throw new ApiError(422, "Select a skip reason.", "SKIP_REASON_REQUIRED");
  }

  const currentStatus = record.outreachStatus as OutreachStatusKey;
  const targetStatus = OUTCOME_TO_STATUS[input.outcome] ?? currentStatus;
  if (targetStatus !== currentStatus && !canTransition(currentStatus, targetStatus)) {
    throw new ApiError(
      409,
      `A record in "${currentStatus}" cannot move to "${targetStatus}".`,
      "INVALID_TRANSITION",
    );
  }

  const now = new Date();
  const followUps =
    input.outcome === "SENT" ? planFollowUps(now, record.campaign.followUpOffsetDays) : [];

  const result = await prisma.$transaction(async (tx) => {
    // Optimistic concurrency: the update only lands on the exact version the
    // operator loaded (§10 Concurrency, §18 Concurrent record update).
    const updated = await tx.campaignInfluencer.updateMany({
      where: { id: recordId, version: input.version },
      data: {
        version: { increment: 1 },
        outreachStatus: targetStatus,
        pipelineStatus: pipelineLaneFor(targetStatus),
        lastContactAt: input.outcome === "SENT" ? now : record.lastContactAt,
        dueAt: followUps.length > 0 ? followUps[0].dueAt : null,
        notes: input.note ? input.note : record.notes,
        draftMessage: input.outcome === "SAVED_FOR_LATER" ? input.confirmedText ?? null : null,
        lockedById: null,
        lockedAt: null,
      },
    });
    if (updated.count === 0) {
      throw new ConflictError();
    }

    const attempt = await tx.outreachAttempt.create({
      data: {
        campaignInfluencerId: recordId,
        type: currentStatus === "FOLLOW_UP_DUE" ? "FOLLOW_UP" : "FIRST_CONTACT",
        channel: input.channel ?? null,
        templateVersionId: record.campaign.templateVersionId,
        preparedText: input.preparedText,
        confirmedSentText: input.outcome === "SENT" ? input.confirmedText ?? null : null,
        outcome: input.outcome,
        skipReasonId: input.skipReasonId ?? null,
        note: input.note ?? "",
        manualSendAffirmed: Boolean(input.manualSendAffirmed),
        unresolvedAcknowledged: Boolean(input.unresolvedAcknowledged),
        sentConfirmedAt: input.outcome === "SENT" ? now : null,
        createdById: user.id,
      },
    });

    // §13 — a reply, decline or DNC cancels every pending reminder.
    if (shouldCancelFollowUps(targetStatus)) {
      await tx.followUpTask.updateMany({
        where: { campaignInfluencerId: recordId, status: "PENDING" },
        data: { status: "CANCELLED", cancelledAt: now, cancelReason: `Status changed to ${targetStatus}` },
      });
    }

    if (followUps.length > 0) {
      await tx.followUpTask.updateMany({
        where: { campaignInfluencerId: recordId, status: "PENDING" },
        data: { status: "CANCELLED", cancelledAt: now, cancelReason: "Superseded by a new message" },
      });
      await tx.followUpTask.createMany({
        data: followUps.map((followUp) => ({
          campaignInfluencerId: recordId,
          attemptId: attempt.id,
          sequence: followUp.sequence,
          dueAt: followUp.dueAt,
          assignedToId: record.assigneeId,
        })),
      });
    }

    if (input.outcome === "DO_NOT_CONTACT") {
      await tx.influencer.update({
        where: { id: record.influencerId },
        data: {
          dncFlag: true,
          dncReason: input.dncReason || input.note || "Marked by operator during outreach.",
          dncSetById: user.id,
          dncSetAt: now,
        },
      });
    }

    return { attemptId: attempt.id };
  });

  await recordAudit({
    actor: user,
    action: AUDIT_ACTIONS.RECORD_OUTCOME,
    entity: "campaign_influencer",
    entityId: recordId,
    campaignId: record.campaignId,
    oldValues: { outreachStatus: currentStatus },
    newValues: {
      outreachStatus: targetStatus,
      outcome: input.outcome,
      channel: input.channel ?? null,
      attemptId: result.attemptId,
      followUpsCreated: followUps.length,
    },
  });

  if (input.outcome === "DO_NOT_CONTACT") {
    await recordAudit({
      actor: user,
      action: AUDIT_ACTIONS.DNC_SET,
      entity: "influencer",
      entityId: record.influencerId,
      campaignId: record.campaignId,
      newValues: { dncFlag: true, reason: input.dncReason || input.note || null },
    });
  }

  // FR-020 / AC-008 — the next eligible record is resolved only after a
  // successful save.
  const next = await loadNextQueueRecord(user, record.campaignId, recordId);

  return {
    recordId,
    newStatus: targetStatus,
    followUpsCreated: followUps.length,
    nextRecordId: next?.id ?? null,
  };
}

/**
 * §10 — "Profile open: record a non-sensitive analytics event only; do not
 * change outreach status." Copy events behave the same way (AC-006).
 */
export async function recordWorkflowEvent(
  user: CurrentUser,
  recordId: string,
  kind: "copy" | "profile_open",
): Promise<void> {
  const record = await prisma.campaignInfluencer.findUnique({
    where: { id: recordId },
    select: { id: true, assigneeId: true, campaign: { select: { ownerId: true } }, influencer: { select: { dncFlag: true } }, dncOverrideById: true },
  });
  if (!record) throw new ApiError(404, "Outreach record not found.", "NOT_FOUND");

  const allowed = canAccessRecord({ userId: user.id, permissions: user.permissions }, "outreach_process", {
    campaignOwnerId: record.campaign.ownerId,
    assigneeId: record.assigneeId,
  });
  if (!allowed) throw new ForbiddenError("This outreach record is not assigned to you.");

  // FR-027 — copying prepared text for a DNC creator is blocked outright.
  if (kind === "copy" && record.influencer.dncFlag && !record.dncOverrideById) {
    throw new ForbiddenError(
      "This creator is flagged Do Not Contact; the message cannot be copied.",
    );
  }

  await prisma.campaignInfluencer.update({
    where: { id: recordId },
    data:
      kind === "copy"
        ? { lastCopiedAt: new Date() }
        : { lastProfileOpenAt: new Date() },
  });
}

export function assertCanAssign(user: CurrentUser): void {
  if (!hasScope(user.permissions, "queue_assign", "all")) {
    throw new ForbiddenError("Your role cannot assign queue records.");
  }
}
