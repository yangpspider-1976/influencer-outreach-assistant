import { prisma } from "@/lib/db";
import { ApiError, ConflictError, jsonError, ok, parseBody } from "@/lib/api";
import { ForbiddenError, requireUser } from "@/lib/auth";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { canAccessRecord } from "@/lib/rbac";
import { statusChangeSchema } from "@/lib/validation";
import {
  canTransition,
  pipelineLaneFor,
  requiresDncOverride,
  type OutreachStatusKey,
} from "@/lib/status";
import { shouldCancelFollowUps } from "@/lib/follow-up";

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /outreach/{id}/status — recruitment pipeline updates (FR-021).
 * Every transition is validated server-side and written to the audit log
 * with the previous status (AC-013).
 */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const input = await parseBody(request, statusChangeSchema);

    const record = await prisma.campaignInfluencer.findUnique({
      where: { id },
      include: { campaign: { select: { id: true, ownerId: true } } },
    });
    if (!record) throw new ApiError(404, "Outreach record not found.", "NOT_FOUND");

    if (
      !canAccessRecord({ userId: user.id, permissions: user.permissions }, "pipeline_update", {
        campaignOwnerId: record.campaign.ownerId,
        assigneeId: record.assigneeId,
      })
    ) {
      throw new ForbiddenError("You cannot update the pipeline for this record.");
    }

    const from = record.outreachStatus as OutreachStatusKey;
    const to = input.status as OutreachStatusKey;

    if (!canTransition(from, to)) {
      throw new ApiError(
        409,
        `A record in "${from}" cannot move to "${to}".`,
        "INVALID_TRANSITION",
      );
    }

    // FR-027 / AC-004 — leaving Do Not Contact needs an authorized, logged override.
    if (requiresDncOverride(from, to)) {
      if (user.permissions.dnc_override !== "all") {
        throw new ForbiddenError(
          "Only an administrator can release a do-not-contact record.",
        );
      }
      if (!input.overrideReason || input.overrideReason.trim().length < 10) {
        throw new ApiError(
          422,
          "A written override reason of at least 10 characters is required.",
          "OVERRIDE_REASON_REQUIRED",
        );
      }
    }

    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.campaignInfluencer.updateMany({
        where: {
          id,
          ...(input.version !== undefined ? { version: input.version } : {}),
        },
        data: {
          version: { increment: 1 },
          outreachStatus: to,
          pipelineStatus: pipelineLaneFor(to),
          ...(input.note !== undefined ? { notes: input.note } : {}),
          ...(input.quotedRate !== undefined ? { quotedRate: input.quotedRate } : {}),
          ...(requiresDncOverride(from, to)
            ? {
                dncOverrideById: user.id,
                dncOverrideAt: now,
                dncOverrideReason: input.overrideReason,
              }
            : {}),
        },
      });
      if (result.count === 0) throw new ConflictError();

      if (shouldCancelFollowUps(to)) {
        await tx.followUpTask.updateMany({
          where: { campaignInfluencerId: id, status: "PENDING" },
          data: { status: "CANCELLED", cancelledAt: now, cancelReason: `Status changed to ${to}` },
        });
      }

      if (to === "DO_NOT_CONTACT") {
        await tx.influencer.update({
          where: { id: record.influencerId },
          data: {
            dncFlag: true,
            dncReason: input.note || "Set from the recruitment pipeline.",
            dncSetById: user.id,
            dncSetAt: now,
          },
        });
      }

      return tx.campaignInfluencer.findUniqueOrThrow({ where: { id } });
    });

    await recordAudit({
      actor: user,
      action: AUDIT_ACTIONS.RECORD_STATUS_CHANGE,
      entity: "campaign_influencer",
      entityId: id,
      campaignId: record.campaignId,
      oldValues: { outreachStatus: from },
      newValues: { outreachStatus: to, note: input.note ?? null },
    });

    if (requiresDncOverride(from, to)) {
      await recordAudit({
        actor: user,
        action: AUDIT_ACTIONS.DNC_OVERRIDE,
        entity: "campaign_influencer",
        entityId: id,
        campaignId: record.campaignId,
        newValues: { reason: input.overrideReason, releasedTo: to },
      });
    }

    return ok({ record: updated });
  } catch (error) {
    return jsonError(error);
  }
}
