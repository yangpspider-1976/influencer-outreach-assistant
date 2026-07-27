import { z } from "zod";
import { jsonError, ok, parseBody, requirePermission } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import {
  assertCampaignAccess,
  checkActivationReadiness,
  setCampaignStatus,
} from "@/lib/campaign-service";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"]).default("ACTIVE"),
});

/** GET — readiness preview shown before the manager confirms activation. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    requirePermission(user, "campaigns_view");
    const { id } = await params;
    await assertCampaignAccess(user, id, "campaigns_view");
    return ok(await checkActivationReadiness(id));
  } catch (error) {
    return jsonError(error);
  }
}

/** POST /campaigns/{id}/activate — validate readiness and set status (FR-004). */
export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    requirePermission(user, "campaigns_write");
    const { id } = await params;
    await assertCampaignAccess(user, id, "campaigns_write");
    const { status } = await parseBody(request, bodySchema);
    const result = await setCampaignStatus(user, id, status);
    return ok(result);
  } catch (error) {
    return jsonError(error);
  }
}
