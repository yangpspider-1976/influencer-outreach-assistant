import { prisma } from "@/lib/db";
import { ApiError, jsonError, ok, parseBody, requirePermission } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { assertCampaignAccess } from "@/lib/campaign-service";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { addToCampaignSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /campaigns/{id}/influencers — add one existing database creator to the
 * campaign audience. Mirrors the import path: gated by `influencers_import`,
 * dedupes on the campaign+influencer pair, requires at least one saved profile
 * (§8), and never contacts anyone — it only builds the audience.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    requirePermission(user, "influencers_import");
    const { id: campaignId } = await params;
    await assertCampaignAccess(user, campaignId, "influencers_import");

    const { influencerId } = await parseBody(request, addToCampaignSchema);

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { status: true },
    });
    if (!campaign) throw new ApiError(404, "Campaign not found.", "NOT_FOUND");
    if (campaign.status === "COMPLETED" || campaign.status === "ARCHIVED") {
      throw new ApiError(
        422,
        "This campaign is closed, so creators can no longer be added to it.",
        "CAMPAIGN_CLOSED",
      );
    }

    const influencer = await prisma.influencer.findFirst({
      where: { id: influencerId, archivedAt: null },
      select: {
        id: true,
        displayName: true,
        dncFlag: true,
        _count: { select: { profiles: true } },
      },
    });
    if (!influencer) throw new ApiError(404, "Creator not found.", "NOT_FOUND");
    if (influencer._count.profiles === 0) {
      throw new ApiError(
        422,
        "This creator has no saved Instagram or Facebook profile, so they can't be added to a campaign audience.",
        "NO_PROFILE",
      );
    }

    const existing = await prisma.campaignInfluencer.findUnique({
      where: { campaignId_influencerId: { campaignId, influencerId } },
      select: { id: true },
    });
    if (existing) {
      throw new ApiError(
        409,
        `${influencer.displayName} is already in this campaign.`,
        "ALREADY_IN_CAMPAIGN",
      );
    }

    // A creator who opted out is added but kept out of every work queue.
    const outreachStatus = influencer.dncFlag ? "DO_NOT_CONTACT" : "NOT_CONTACTED";
    const record = await prisma.campaignInfluencer.create({
      data: { campaignId, influencerId, outreachStatus: outreachStatus as never },
      select: { id: true },
    });

    await recordAudit({
      actor: user,
      action: AUDIT_ACTIONS.RECORD_ADD,
      entity: "campaign_influencer",
      entityId: record.id,
      campaignId,
      newValues: {
        influencerId,
        displayName: influencer.displayName,
        outreachStatus,
        source: "manual_add",
      },
    });

    return ok({ recordId: record.id, outreachStatus });
  } catch (error) {
    return jsonError(error);
  }
}
