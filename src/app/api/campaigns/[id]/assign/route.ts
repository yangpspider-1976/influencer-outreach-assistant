import { prisma } from "@/lib/db";
import { ApiError, jsonError, ok, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { assignSchema } from "@/lib/validation";
import { assertCampaignAccess } from "@/lib/campaign-service";
import { assertCanAssign } from "@/lib/outreach-service";

type Params = { params: Promise<{ id: string }> };

/** POST /campaigns/{id}/assign — bulk assignment (FR-014, FR-029). */
export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    assertCanAssign(user);
    const { id } = await params;
    await assertCampaignAccess(user, id, "queue_assign");

    const input = await parseBody(request, assignSchema);

    if (input.assigneeId) {
      const assignee = await prisma.user.findUnique({ where: { id: input.assigneeId } });
      if (!assignee || assignee.status !== "ACTIVE") {
        throw new ApiError(422, "The selected operator is not available.", "INVALID_ASSIGNEE");
      }
    }

    // FR-027 / AC-004 — do-not-contact records can never be queued by
    // assignment, even in bulk, unless an override was already logged.
    const records = await prisma.campaignInfluencer.findMany({
      where: { id: { in: input.recordIds }, campaignId: id },
      select: {
        id: true,
        outreachStatus: true,
        dncOverrideById: true,
        influencer: { select: { dncFlag: true, displayName: true } },
      },
    });

    const blocked = records.filter((r) => r.influencer.dncFlag && !r.dncOverrideById);
    const assignable = records.filter((r) => !r.influencer.dncFlag || r.dncOverrideById);

    if (assignable.length === 0) {
      throw new ApiError(
        422,
        "None of the selected records can be assigned. Do-not-contact records need an administrator override.",
        "NO_ASSIGNABLE_RECORDS",
        { blocked: blocked.map((r) => r.influencer.displayName) },
      );
    }

    const readyIds = assignable
      .filter((r) => ["NOT_CONTACTED", "READY"].includes(r.outreachStatus))
      .map((r) => r.id);

    await prisma.$transaction(async (tx) => {
      await tx.campaignInfluencer.updateMany({
        where: { id: { in: assignable.map((r) => r.id) } },
        data: {
          assigneeId: input.assigneeId,
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
        },
      });
      if (input.markReady && input.assigneeId && readyIds.length > 0) {
        await tx.campaignInfluencer.updateMany({
          where: { id: { in: readyIds } },
          data: { outreachStatus: "READY" },
        });
      }
      if (!input.assigneeId) {
        // Unassigning returns records to the unprepared pool.
        await tx.campaignInfluencer.updateMany({
          where: { id: { in: readyIds } },
          data: { outreachStatus: "NOT_CONTACTED" },
        });
      }
    });

    await recordAudit({
      actor: user,
      action: AUDIT_ACTIONS.RECORD_ASSIGN,
      entity: "campaign_influencer",
      entityId: null,
      campaignId: id,
      newValues: {
        assigneeId: input.assigneeId,
        recordCount: assignable.length,
        markedReady: input.markReady ? readyIds.length : 0,
        blockedByDnc: blocked.length,
      },
    });

    return ok({
      assigned: assignable.length,
      markedReady: input.markReady && input.assigneeId ? readyIds.length : 0,
      blockedByDnc: blocked.map((r) => r.influencer.displayName),
    });
  } catch (error) {
    return jsonError(error);
  }
}
