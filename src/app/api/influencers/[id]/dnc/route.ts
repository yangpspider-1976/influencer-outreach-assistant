import { prisma } from "@/lib/db";
import { ApiError, jsonError, ok, parseBody, requirePermission } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { dncSchema } from "@/lib/validation";
import { ForbiddenError } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /influencers/{id}/dnc — set or clear the do-not-contact flag.
 *
 * Setting it also removes the creator from every open outreach queue.
 * Clearing it is an administrator-only, audited action (FR-027, SEC-010).
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    requirePermission(user, "influencers_dnc");
    const { id } = await params;
    const input = await parseBody(request, dncSchema);

    const influencer = await prisma.influencer.findUnique({ where: { id } });
    if (!influencer) throw new ApiError(404, "Influencer not found.", "NOT_FOUND");

    if (!input.dnc && user.permissions.dnc_override !== "all") {
      throw new ForbiddenError("Only an administrator can clear a do-not-contact flag.");
    }
    if (!input.dnc && (!input.reason || input.reason.trim().length < 10)) {
      throw new ApiError(
        422,
        "A written reason of at least 10 characters is required to clear a do-not-contact flag.",
        "REASON_REQUIRED",
      );
    }

    const now = new Date();
    const releasedRecords = await prisma.$transaction(async (tx) => {
      await tx.influencer.update({
        where: { id },
        data: {
          dncFlag: input.dnc,
          dncReason: input.reason ?? null,
          dncSetById: input.dnc ? user.id : null,
          dncSetAt: input.dnc ? now : null,
        },
      });

      if (input.dnc) {
        // Pull the creator out of every queue that has not concluded yet.
        await tx.campaignInfluencer.updateMany({
          where: {
            influencerId: id,
            outreachStatus: { in: ["NOT_CONTACTED", "READY", "FOLLOW_UP_DUE", "SENT"] },
          },
          data: { outreachStatus: "DO_NOT_CONTACT", pipelineStatus: "NONE", dueAt: null },
        });
        await tx.followUpTask.updateMany({
          where: { campaignInfluencer: { influencerId: id }, status: "PENDING" },
          data: { status: "CANCELLED", cancelledAt: now, cancelReason: "Creator marked do not contact" },
        });
        return 0;
      }

      // Clearing the creator-level flag must also release campaign records that
      // were withdrawn as DNC. Return them to the unprepared pool so clearing an
      // opt-out never queues outreach automatically.
      const released = await tx.campaignInfluencer.updateMany({
        where: { influencerId: id, outreachStatus: "DO_NOT_CONTACT" },
        data: {
          outreachStatus: "NOT_CONTACTED",
          pipelineStatus: "NONE",
          dueAt: null,
          dncOverrideById: null,
          dncOverrideAt: null,
          dncOverrideReason: null,
          version: { increment: 1 },
        },
      });

      // A global clear supersedes campaign-specific exceptions. Removing these
      // markers prevents an old override from bypassing a later DNC decision.
      await tx.campaignInfluencer.updateMany({
        where: { influencerId: id, dncOverrideById: { not: null } },
        data: {
          dncOverrideById: null,
          dncOverrideAt: null,
          dncOverrideReason: null,
        },
      });

      return released.count;
    });

    await recordAudit({
      actor: user,
      action: input.dnc ? AUDIT_ACTIONS.DNC_SET : AUDIT_ACTIONS.DNC_CLEAR,
      entity: "influencer",
      entityId: id,
      oldValues: { dncFlag: influencer.dncFlag, dncReason: influencer.dncReason },
      newValues: {
        dncFlag: input.dnc,
        dncReason: input.reason ?? null,
        ...(!input.dnc ? { releasedCampaignRecords: releasedRecords } : {}),
      },
    });

    return ok({ ok: true, releasedRecords });
  } catch (error) {
    return jsonError(error);
  }
}
