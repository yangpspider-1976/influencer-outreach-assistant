import { prisma } from "@/lib/db";
import { ApiError, jsonError, ok, parseBody } from "@/lib/api";
import { ForbiddenError, requireUser } from "@/lib/auth";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { canAccessRecord } from "@/lib/rbac";
import { followUpUpdateSchema } from "@/lib/validation";
import { noResponseClosureAt } from "@/lib/follow-up";

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /follow-ups/{id} — complete or cancel a manual reminder (FR-022, AC-009).
 *
 * Completing the final follow-up with no reply closes the record as
 * No Response, matching the §13 closure rule.
 */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const input = await parseBody(request, followUpUpdateSchema);

    const task = await prisma.followUpTask.findUnique({
      where: { id },
      include: {
        campaignInfluencer: {
          include: { campaign: { select: { id: true, ownerId: true, followUpOffsetDays: true } } },
        },
      },
    });
    if (!task) throw new ApiError(404, "Follow-up task not found.", "NOT_FOUND");
    if (task.status !== "PENDING") {
      throw new ApiError(409, "This follow-up task is already closed.", "ALREADY_CLOSED");
    }

    if (
      !canAccessRecord({ userId: user.id, permissions: user.permissions }, "outreach_process", {
        campaignOwnerId: task.campaignInfluencer.campaign.ownerId,
        assigneeId: task.assignedToId ?? task.campaignInfluencer.assigneeId,
      })
    ) {
      throw new ForbiddenError("This follow-up task is not assigned to you.");
    }

    const now = new Date();
    const record = task.campaignInfluencer;

    await prisma.$transaction(async (tx) => {
      await tx.followUpTask.update({
        where: { id },
        data:
          input.status === "COMPLETED"
            ? { status: "COMPLETED", completedAt: now }
            : { status: "CANCELLED", cancelledAt: now, cancelReason: input.note ?? "Cancelled by user" },
      });

      if (input.status !== "COMPLETED") return;

      const remaining = await tx.followUpTask.count({
        where: { campaignInfluencerId: record.id, status: "PENDING" },
      });

      if (remaining > 0) {
        const next = await tx.followUpTask.findFirst({
          where: { campaignInfluencerId: record.id, status: "PENDING" },
          orderBy: { dueAt: "asc" },
        });
        await tx.campaignInfluencer.update({
          where: { id: record.id },
          data: {
            outreachStatus: "SENT",
            dueAt: next?.dueAt ?? null,
            version: { increment: 1 },
          },
        });
        return;
      }

      // §13 — no response closure once the final follow-up window expires.
      const closure = noResponseClosureAt(
        record.lastContactAt ?? task.dueAt,
        record.campaign.followUpOffsetDays,
      );
      await tx.campaignInfluencer.update({
        where: { id: record.id },
        data: {
          outreachStatus: now >= closure ? "NO_RESPONSE" : "SENT",
          pipelineStatus: now >= closure ? "NO_RESPONSE" : "NONE",
          dueAt: null,
          version: { increment: 1 },
        },
      });
    });

    await recordAudit({
      actor: user,
      action:
        input.status === "COMPLETED"
          ? AUDIT_ACTIONS.FOLLOW_UP_COMPLETE
          : AUDIT_ACTIONS.FOLLOW_UP_CANCEL,
      entity: "follow_up_task",
      entityId: id,
      campaignId: record.campaignId,
      oldValues: { status: "PENDING" },
      newValues: { status: input.status, note: input.note ?? null },
    });

    return ok({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
