import { prisma } from "@/lib/db";
import { jsonError, ok, parseBody, requirePermission } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { campaignInputSchema } from "@/lib/validation";
import { assertCampaignAccess, updateCampaign } from "@/lib/campaign-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    requirePermission(user, "campaigns_view");
    const { id } = await params;
    await assertCampaignAccess(user, id, "campaigns_view");

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        client: true,
        owner: { select: { id: true, name: true, email: true } },
        templateVersion: { include: { template: true } },
        _count: { select: { records: true } },
      },
    });
    return ok({ campaign });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    requirePermission(user, "campaigns_write");
    const { id } = await params;
    await assertCampaignAccess(user, id, "campaigns_write");
    const input = await parseBody(request, campaignInputSchema);
    const campaign = await updateCampaign(user, id, input);
    return ok({ campaign });
  } catch (error) {
    return jsonError(error);
  }
}
