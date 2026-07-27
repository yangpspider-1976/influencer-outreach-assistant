import { prisma } from "@/lib/db";
import { ApiError, jsonError, ok, parseBody, requirePermission } from "@/lib/api";
import { hashPassword, requireUser } from "@/lib/auth";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { userInputSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /users/{id} — update role, status or password (admin only).
 *
 * Disabling an account or changing its password bumps `sessionEpoch`, which
 * invalidates every live session immediately (SEC-011).
 */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const actor = await requireUser();
    requirePermission(actor, "manage_users");
    const { id } = await params;
    const input = await parseBody(request, userInputSchema.partial());

    const existing = await prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!existing) throw new ApiError(404, "User not found.", "NOT_FOUND");

    if (existing.id === actor.id && input.status === "DISABLED") {
      throw new ApiError(422, "You cannot disable your own account.", "SELF_DISABLE");
    }

    const role = input.roleKey
      ? await prisma.role.findUnique({ where: { key: input.roleKey } })
      : null;
    if (input.roleKey && !role) throw new ApiError(422, "Unknown role.", "UNKNOWN_ROLE");

    const invalidatesSessions =
      Boolean(input.password) || (input.status && input.status !== existing.status);

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.email ? { email: input.email } : {}),
        ...(role ? { roleId: role.id } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
        ...(invalidatesSessions ? { sessionEpoch: { increment: 1 } } : {}),
      },
      include: { role: true },
    });

    await recordAudit({
      actor,
      action:
        input.status === "DISABLED"
          ? AUDIT_ACTIONS.USER_DISABLE
          : input.status === "ACTIVE"
            ? AUDIT_ACTIONS.USER_ENABLE
            : AUDIT_ACTIONS.USER_UPDATE,
      entity: "user",
      entityId: id,
      oldValues: { role: existing.role.key, status: existing.status, name: existing.name },
      newValues: {
        role: updated.role.key,
        status: updated.status,
        name: updated.name,
        passwordChanged: Boolean(input.password),
      },
    });

    return ok({
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        status: updated.status,
        roleKey: updated.role.key,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
