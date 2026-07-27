import { prisma } from "@/lib/db";
import { jsonError, ok, requirePermission } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { assertCampaignAccess } from "@/lib/campaign-service";
import type { Prisma } from "@/generated/prisma/client";

type Params = { params: Promise<{ id: string }> };

/** GET /campaigns/{id}/records — campaign audience with filters (FR-013, FR-028). */
export async function GET(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    requirePermission(user, "campaigns_view");
    const { id } = await params;
    await assertCampaignAccess(user, id, "campaigns_view");

    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const assigneeId = url.searchParams.get("assigneeId");
    const channel = url.searchParams.get("channel");
    const search = url.searchParams.get("search")?.trim();
    const take = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);
    const skip = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);

    const where: Prisma.CampaignInfluencerWhereInput = {
      campaignId: id,
      ...(status ? { outreachStatus: status as never } : {}),
      ...(assigneeId
        ? assigneeId === "unassigned"
          ? { assigneeId: null }
          : { assigneeId }
        : {}),
      ...(channel || search
        ? {
            influencer: {
              ...(channel ? { profiles: { some: { platform: channel as never } } } : {}),
              ...(search
                ? {
                    OR: [
                      { displayName: { contains: search, mode: "insensitive" as const } },
                      { category: { contains: search, mode: "insensitive" as const } },
                      { location: { contains: search, mode: "insensitive" as const } },
                    ],
                  }
                : {}),
            },
          }
        : {}),
    };

    const [records, total, statusGroups] = await Promise.all([
      prisma.campaignInfluencer.findMany({
        where,
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
        take,
        skip,
        include: {
          assignee: { select: { id: true, name: true } },
          influencer: {
            select: {
              id: true,
              displayName: true,
              category: true,
              location: true,
              followerCountRaw: true,
              followerCountNumeric: true,
              dncFlag: true,
              profiles: {
                select: { platform: true, originalUrl: true, preferredFlag: true },
              },
            },
          },
        },
      }),
      prisma.campaignInfluencer.count({ where }),
      prisma.campaignInfluencer.groupBy({
        by: ["outreachStatus"],
        where: { campaignId: id },
        _count: { _all: true },
      }),
    ]);

    return ok({
      total,
      records,
      statusCounts: Object.fromEntries(
        statusGroups.map((group) => [group.outreachStatus, group._count._all]),
      ),
    });
  } catch (error) {
    return jsonError(error);
  }
}
