import { prisma } from "@/lib/db";
import { jsonError, ok, requirePermission } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { queueOrderBy, queueWhere } from "@/lib/outreach-service";

/** GET /outreach/queue — the caller's eligible queue in §10 order. */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    requirePermission(user, "outreach_process");

    const url = new URL(request.url);
    const campaignId = url.searchParams.get("campaignId");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);

    const [records, total] = await Promise.all([
      prisma.campaignInfluencer.findMany({
        where: queueWhere(user.id, campaignId),
        orderBy: queueOrderBy,
        take: limit,
        include: {
          campaign: { select: { id: true, name: true, client: { select: { name: true } } } },
          influencer: {
            select: {
              id: true,
              displayName: true,
              category: true,
              location: true,
              followerCountNumeric: true,
              profiles: { select: { platform: true, preferredFlag: true } },
            },
          },
        },
      }),
      prisma.campaignInfluencer.count({ where: queueWhere(user.id, campaignId) }),
    ]);

    return ok({
      total,
      nextRecordId: records[0]?.id ?? null,
      records: records.map((record) => ({
        id: record.id,
        priority: record.priority,
        dueAt: record.dueAt,
        outreachStatus: record.outreachStatus,
        campaign: {
          id: record.campaign.id,
          name: record.campaign.name,
          client: record.campaign.client.name,
        },
        influencer: {
          id: record.influencer.id,
          displayName: record.influencer.displayName,
          category: record.influencer.category,
          location: record.influencer.location,
          followers: record.influencer.followerCountNumeric,
          platforms: record.influencer.profiles.map((profile) => profile.platform),
        },
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}
