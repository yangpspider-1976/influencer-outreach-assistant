import "server-only";
import { prisma } from "./db";
import { ApiError } from "./api";
import { AUDIT_ACTIONS, diff, recordAudit } from "./audit";
import { ForbiddenError, type CurrentUser } from "./auth";
import { canAccessRecord, hasScope, type Permission } from "./rbac";
import { normalizeFollowUpOffsets } from "./follow-up";
import type { CampaignInput } from "./validation";

/**
 * Campaign lifecycle (FR-003, FR-004, AC-001) plus the campaign-level
 * authorization helper used by every campaign-scoped endpoint (SEC-004).
 */

export async function assertCampaignAccess(
  user: CurrentUser,
  campaignId: string,
  permission: Permission,
): Promise<{ id: string; ownerId: string; status: string; name: string }> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, ownerId: true, status: true, name: true },
  });
  if (!campaign) throw new ApiError(404, "Campaign not found.", "NOT_FOUND");

  const scope = user.permissions[permission];
  if (scope === "all") return campaign;
  if (scope === "campaign" || scope === "assigned") {
    const allowed =
      campaign.ownerId === user.id ||
      (await prisma.campaignInfluencer.count({
        where: { campaignId, assigneeId: user.id },
      })) > 0;
    if (allowed) return campaign;
  }
  if (
    canAccessRecord({ userId: user.id, permissions: user.permissions }, permission, {
      campaignOwnerId: campaign.ownerId,
    })
  ) {
    return campaign;
  }
  throw new ForbiddenError("You do not have access to this campaign.");
}

/** Campaigns visible to the caller, honouring the `campaigns_view` scope. */
export function visibleCampaignFilter(user: CurrentUser) {
  if (hasScope(user.permissions, "campaigns_view", "all")) return {};
  return {
    OR: [{ ownerId: user.id }, { records: { some: { assigneeId: user.id } } }],
  };
}

async function resolveClientId(input: CampaignInput): Promise<string> {
  if (input.clientId) {
    const client = await prisma.client.findUnique({ where: { id: input.clientId } });
    if (!client) throw new ApiError(422, "The selected client no longer exists.", "CLIENT_NOT_FOUND");
    return client.id;
  }
  const name = input.clientName!.trim();
  const client = await prisma.client.upsert({
    where: { name },
    update: {},
    create: { name },
  });
  return client.id;
}

async function resolveTemplateVersionId(templateId: string | null | undefined) {
  if (!templateId) return null;
  const template = await prisma.messageTemplate.findUnique({
    where: { id: templateId },
    include: { currentVersion: true },
  });
  if (!template?.currentVersion) {
    throw new ApiError(422, "The selected template has no approved version.", "TEMPLATE_NOT_READY");
  }
  return template.currentVersion.id;
}

export async function createCampaign(user: CurrentUser, input: CampaignInput) {
  const clientId = await resolveClientId(input);
  const templateVersionId = await resolveTemplateVersionId(input.templateId);

  const campaign = await prisma.campaign.create({
    data: {
      clientId,
      name: input.name,
      location: input.location,
      visitStart: input.visitStart,
      visitEnd: input.visitEnd,
      deliverables: input.deliverables,
      deliverablesShort: input.deliverablesShort || input.deliverables.split("\n")[0].slice(0, 300),
      compensation: input.compensation,
      applicationDeadline: input.applicationDeadline ?? null,
      targetCategory: input.targetCategory,
      targetLocation: input.targetLocation,
      briefUrl: input.briefUrl || null,
      briefLinkEnabled: input.briefLinkEnabled,
      ownerId: input.ownerId,
      templateVersionId,
      notes: input.notes,
      followUpOffsetDays: normalizeFollowUpOffsets(input.followUpOffsetDays),
      status: "DRAFT",
    },
    include: { client: true },
  });

  await recordAudit({
    actor: user,
    action: AUDIT_ACTIONS.CAMPAIGN_CREATE,
    entity: "campaign",
    entityId: campaign.id,
    campaignId: campaign.id,
    newValues: { name: campaign.name, client: campaign.client.name, status: campaign.status },
  });

  return campaign;
}

export async function updateCampaign(user: CurrentUser, id: string, input: CampaignInput) {
  const existing = await prisma.campaign.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Campaign not found.", "NOT_FOUND");
  if (existing.status === "ARCHIVED") {
    throw new ApiError(409, "An archived campaign cannot be edited.", "CAMPAIGN_ARCHIVED");
  }

  const clientId = await resolveClientId(input);
  const templateVersionId = await resolveTemplateVersionId(input.templateId);

  const data = {
    clientId,
    name: input.name,
    location: input.location,
    visitStart: input.visitStart,
    visitEnd: input.visitEnd,
    deliverables: input.deliverables,
    deliverablesShort: input.deliverablesShort || input.deliverables.split("\n")[0].slice(0, 300),
    compensation: input.compensation,
    applicationDeadline: input.applicationDeadline ?? null,
    targetCategory: input.targetCategory,
    targetLocation: input.targetLocation,
    briefUrl: input.briefUrl || null,
    briefLinkEnabled: input.briefLinkEnabled,
    ownerId: input.ownerId,
    templateVersionId,
    notes: input.notes,
    followUpOffsetDays: normalizeFollowUpOffsets(input.followUpOffsetDays),
  };

  const campaign = await prisma.campaign.update({ where: { id }, data, include: { client: true } });

  const changes = diff(existing as unknown as Record<string, unknown>, data);
  if (changes) {
    await recordAudit({
      actor: user,
      action: AUDIT_ACTIONS.CAMPAIGN_UPDATE,
      entity: "campaign",
      entityId: id,
      campaignId: id,
      oldValues: changes.old,
      newValues: changes.next,
    });
  }

  return campaign;
}

export type ActivationCheck = {
  ready: boolean;
  blockers: string[];
  warnings: string[];
};

/** AC-001 — a campaign may only go Active once it is genuinely usable. */
export async function checkActivationReadiness(campaignId: string): Promise<ActivationCheck> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      client: true,
      templateVersion: true,
      _count: { select: { records: true } },
    },
  });
  if (!campaign) throw new ApiError(404, "Campaign not found.", "NOT_FOUND");

  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!campaign.templateVersion) {
    blockers.push("Select a default message template before activating.");
  } else if (campaign.templateVersion.status !== "APPROVED") {
    blockers.push("The selected template version is not approved yet.");
  }
  if (campaign.visitEnd < campaign.visitStart) {
    blockers.push("The visit end date is before the start date.");
  }
  for (const [label, value] of [
    ["client", campaign.client?.name],
    ["location", campaign.location],
    ["deliverables", campaign.deliverables],
    ["compensation", campaign.compensation],
  ] as const) {
    if (!value) blockers.push(`The campaign ${label} is required.`);
  }

  // §7 — "Warn if earlier than the current date when activating."
  if (campaign.applicationDeadline && campaign.applicationDeadline < new Date()) {
    warnings.push("The application deadline is already in the past.");
  }
  if (campaign._count.records === 0) {
    warnings.push("No influencers have been imported into this campaign yet.");
  }
  if (campaign.followUpOffsetDays.length === 0) {
    warnings.push("No follow-up reminders are configured for this campaign.");
  }

  return { ready: blockers.length === 0, blockers, warnings };
}

export async function activateCampaign(user: CurrentUser, id: string) {
  const check = await checkActivationReadiness(id);
  if (!check.ready) {
    throw new ApiError(422, "The campaign is not ready to activate.", "NOT_READY", check);
  }

  const campaign = await prisma.campaign.update({
    where: { id },
    data: { status: "ACTIVE", activatedAt: new Date() },
  });

  await recordAudit({
    actor: user,
    action: AUDIT_ACTIONS.CAMPAIGN_ACTIVATE,
    entity: "campaign",
    entityId: id,
    campaignId: id,
    oldValues: { status: "DRAFT" },
    newValues: { status: "ACTIVE" },
  });

  return { campaign, warnings: check.warnings };
}

export async function setCampaignStatus(
  user: CurrentUser,
  id: string,
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED",
) {
  if (status === "ACTIVE") return activateCampaign(user, id);

  const existing = await prisma.campaign.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Campaign not found.", "NOT_FOUND");

  const campaign = await prisma.campaign.update({
    where: { id },
    data: { status, archivedAt: status === "ARCHIVED" ? new Date() : null },
  });

  await recordAudit({
    actor: user,
    action: status === "ARCHIVED" ? AUDIT_ACTIONS.CAMPAIGN_ARCHIVE : AUDIT_ACTIONS.CAMPAIGN_UPDATE,
    entity: "campaign",
    entityId: id,
    campaignId: id,
    oldValues: { status: existing.status },
    newValues: { status },
  });

  return { campaign, warnings: [] as string[] };
}
