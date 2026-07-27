import { prisma } from "@/lib/db";
import { jsonError, ok, requirePermission } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { hasScope } from "@/lib/rbac";
import type { Prisma } from "@/generated/prisma/client";

/** GET /follow-ups — due and upcoming manual reminders (FR-022, FR-030). */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    requirePermission(user, "outreach_process");

    const url = new URL(request.url);
    const scope = url.searchParams.get("scope") ?? "due";
    const campaignId = url.searchParams.get("campaignId");

    // Managers see the whole campaign; operators only see their own reminders.
    const seesAll = hasScope(user.permissions, "outreach_process", "all");

    const where: Prisma.FollowUpTaskWhereInput = {
      status: "PENDING",
      ...(seesAll ? {} : { assignedToId: user.id }),
      ...(campaignId ? { campaignInfluencer: { campaignId } } : {}),
      ...(scope === "due" ? { dueAt: { lte: new Date() } } : {}),
    };

    const tasks = await prisma.followUpTask.findMany({
      where,
      orderBy: [{ dueAt: "asc" }],
      take: 200,
      include: {
        assignedTo: { select: { id: true, name: true } },
        attempt: { select: { confirmedSentText: true, sentConfirmedAt: true, channel: true } },
        campaignInfluencer: {
          select: {
            id: true,
            outreachStatus: true,
            campaign: { select: { id: true, name: true, client: { select: { name: true } } } },
            influencer: {
              select: {
                id: true,
                displayName: true,
                dncFlag: true,
                profiles: { select: { platform: true, originalUrl: true, preferredFlag: true } },
              },
            },
          },
        },
      },
    });

    return ok({
      tasks: tasks.map((task) => ({
        id: task.id,
        sequence: task.sequence,
        dueAt: task.dueAt,
        overdue: task.dueAt.getTime() < Date.now(),
        assignedTo: task.assignedTo,
        previousMessage: task.attempt?.confirmedSentText ?? null,
        previousSentAt: task.attempt?.sentConfirmedAt ?? null,
        channel: task.attempt?.channel ?? null,
        record: {
          id: task.campaignInfluencer.id,
          outreachStatus: task.campaignInfluencer.outreachStatus,
          campaign: {
            id: task.campaignInfluencer.campaign.id,
            name: task.campaignInfluencer.campaign.name,
            client: task.campaignInfluencer.campaign.client.name,
          },
          influencer: {
            id: task.campaignInfluencer.influencer.id,
            displayName: task.campaignInfluencer.influencer.displayName,
            dncFlag: task.campaignInfluencer.influencer.dncFlag,
            profiles: task.campaignInfluencer.influencer.profiles,
          },
        },
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}
