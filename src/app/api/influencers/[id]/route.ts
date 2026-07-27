import { prisma } from "@/lib/db";
import { ApiError, jsonError, ok, parseBody, requirePermission } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { AUDIT_ACTIONS, diff, recordAudit } from "@/lib/audit";
import { influencerUpdateSchema } from "@/lib/validation";
import { normalizeFollowerCount } from "@/lib/social-url";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    requirePermission(user, "influencers_view");
    const { id } = await params;

    const influencer = await prisma.influencer.findUnique({
      where: { id },
      include: {
        profiles: true,
        tags: { include: { tag: true } },
        records: {
          orderBy: { updatedAt: "desc" },
          include: {
            campaign: { select: { id: true, name: true, status: true, client: { select: { name: true } } } },
            assignee: { select: { id: true, name: true } },
            attempts: { orderBy: { createdAt: "desc" }, take: 5 },
          },
        },
      },
    });
    if (!influencer) throw new ApiError(404, "Influencer not found.", "NOT_FOUND");
    return ok({ influencer });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    requirePermission(user, "influencers_write");
    const { id } = await params;
    const input = await parseBody(request, influencerUpdateSchema);

    const existing = await prisma.influencer.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Influencer not found.", "NOT_FOUND");

    const followers =
      input.followerCountRaw !== undefined
        ? normalizeFollowerCount(input.followerCountRaw)
        : null;

    const data = {
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.firstName !== undefined ? { firstName: input.firstName || null } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.location !== undefined ? { location: input.location } : {}),
      ...(followers
        ? { followerCountRaw: followers.raw, followerCountNumeric: followers.numeric }
        : {}),
      ...(input.email !== undefined ? { email: input.email || null } : {}),
      ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
      ...(input.rate !== undefined ? { rate: input.rate || null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    };

    const influencer = await prisma.influencer.update({ where: { id }, data });

    const changes = diff(existing as unknown as Record<string, unknown>, data);
    if (changes) {
      await recordAudit({
        actor: user,
        action: AUDIT_ACTIONS.INFLUENCER_UPDATE,
        entity: "influencer",
        entityId: id,
        oldValues: changes.old,
        newValues: changes.next,
      });
    }

    return ok({ influencer });
  } catch (error) {
    return jsonError(error);
  }
}
