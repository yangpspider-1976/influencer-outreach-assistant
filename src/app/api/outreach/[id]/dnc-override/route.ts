import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, jsonError, ok, parseBody } from "@/lib/api";
import { ForbiddenError, requireUser } from "@/lib/auth";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  reason: z.string().trim().min(10, "Give a reason of at least 10 characters."),
  assigneeId: z.string().min(1).nullable().optional(),
});

/**
 * POST /outreach/{id}/dnc-override — FR-027 / AC-004.
 *
 * A do-not-contact record only ever enters the outreach queue through this
 * endpoint: administrator-only, reason required, and always audited.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    if (user.permissions.dnc_override !== "all") {
      throw new ForbiddenError("Only an administrator can override a do-not-contact record.");
    }

    const { id } = await params;
    const input = await parseBody(request, bodySchema);

    const record = await prisma.campaignInfluencer.findUnique({
      where: { id },
      include: { influencer: { select: { id: true, displayName: true, dncFlag: true } } },
    });
    if (!record) throw new ApiError(404, "Outreach record not found.", "NOT_FOUND");
    if (!record.influencer.dncFlag) {
      throw new ApiError(
        409,
        "This creator is not flagged Do Not Contact.",
        "NOT_DNC",
      );
    }

    const now = new Date();
    const updated = await prisma.campaignInfluencer.update({
      where: { id },
      data: {
        dncOverrideById: user.id,
        dncOverrideAt: now,
        dncOverrideReason: input.reason,
        outreachStatus: "READY",
        assigneeId: input.assigneeId ?? record.assigneeId,
        version: { increment: 1 },
      },
    });

    await recordAudit({
      actor: user,
      action: AUDIT_ACTIONS.DNC_OVERRIDE,
      entity: "campaign_influencer",
      entityId: id,
      campaignId: record.campaignId,
      oldValues: { outreachStatus: record.outreachStatus, dncOverrideById: null },
      newValues: {
        outreachStatus: "READY",
        influencer: record.influencer.displayName,
        reason: input.reason,
      },
    });

    return ok({ record: updated });
  } catch (error) {
    return jsonError(error);
  }
}
