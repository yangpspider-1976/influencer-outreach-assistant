import { jsonError, ok, requirePermission } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { hasScope } from "@/lib/rbac";
import { assertCampaignAccess } from "@/lib/campaign-service";
import { buildCampaignReport } from "@/lib/reports-service";

type Params = { params: Promise<{ id: string }> };

/** GET /reports/campaign/{id} — funnel and operator metrics (FR-025, AC-010). */
export async function GET(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    requirePermission(user, "reports_view");
    const { id } = await params;
    await assertCampaignAccess(user, id, "campaigns_view");

    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const operatorId = url.searchParams.get("operatorId");

    // An operator with `reports_view: own` only ever sees their own numbers.
    const scopedOperatorId = hasScope(user.permissions, "reports_view", "all")
      ? operatorId
      : user.id;

    const report = await buildCampaignReport({
      campaignId: id,
      operatorId: scopedOperatorId,
      from: from ? new Date(from) : null,
      to: to ? new Date(to) : null,
    });

    return ok(report);
  } catch (error) {
    return jsonError(error);
  }
}
