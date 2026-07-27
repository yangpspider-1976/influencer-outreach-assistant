import { prisma } from "@/lib/db";
import { jsonError, ok, requirePermission } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { hasScope } from "@/lib/rbac";
import type { Prisma } from "@/generated/prisma/client";

/**
 * GET /audit-logs — authorized audit search (FR-024, AC-013).
 *
 * §5 scope: admins see everything, campaign managers see their campaigns,
 * operators see only their own actions.
 */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    requirePermission(user, "audit_view");

    const url = new URL(request.url);
    const action = url.searchParams.get("action");
    const entity = url.searchParams.get("entity");
    const campaignId = url.searchParams.get("campaignId");
    const search = url.searchParams.get("search")?.trim();
    const take = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);
    const skip = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);

    let scopeFilter: Prisma.AuditLogWhereInput = {};
    if (!hasScope(user.permissions, "audit_view", "all")) {
      scopeFilter = hasScope(user.permissions, "audit_view", "campaign")
        ? { OR: [{ actorId: user.id }, { campaignId: { in: await ownedCampaignIds(user.id) } }] }
        : { actorId: user.id };
    }

    const where: Prisma.AuditLogWhereInput = {
      ...scopeFilter,
      ...(action ? { action: { contains: action } } : {}),
      ...(entity ? { entity } : {}),
      ...(campaignId ? { campaignId } : {}),
      ...(search
        ? {
            OR: [
              { actorEmail: { contains: search, mode: "insensitive" } },
              { action: { contains: search, mode: "insensitive" } },
              { entityId: { contains: search } },
            ],
          }
        : {}),
    };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take, skip }),
      prisma.auditLog.count({ where }),
    ]);

    return ok({ total, logs });
  } catch (error) {
    return jsonError(error);
  }
}

async function ownedCampaignIds(userId: string): Promise<string[]> {
  const campaigns = await prisma.campaign.findMany({
    where: { ownerId: userId },
    select: { id: true },
  });
  return campaigns.map((campaign) => campaign.id);
}
