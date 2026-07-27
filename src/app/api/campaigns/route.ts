import { prisma } from "@/lib/db";
import { jsonError, ok, parseBody, requirePermission } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { campaignInputSchema } from "@/lib/validation";
import { createCampaign, visibleCampaignFilter } from "@/lib/campaign-service";

/** GET /campaigns — list campaigns with filters and headline metrics. */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    requirePermission(user, "campaigns_view");

    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim();
    const status = url.searchParams.get("status");
    const ownerId = url.searchParams.get("ownerId");

    const campaigns = await prisma.campaign.findMany({
      where: {
        ...visibleCampaignFilter(user),
        ...(status ? { status: status as never } : {}),
        ...(ownerId ? { ownerId } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" as const } },
                { client: { name: { contains: search, mode: "insensitive" as const } } },
                { location: { contains: search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      include: {
        client: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        _count: { select: { records: true } },
      },
    });

    return ok({ campaigns });
  } catch (error) {
    return jsonError(error);
  }
}

/** POST /campaigns — create a campaign (FR-003). */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    requirePermission(user, "campaigns_write");
    const input = await parseBody(request, campaignInputSchema);
    const campaign = await createCampaign(user, input);
    return ok({ campaign }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
