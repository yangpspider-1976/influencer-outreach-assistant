import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, ok, parseBody, requirePermission } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { PERMISSIONS, SCOPES, parsePermissionSet } from "@/lib/rbac";

export async function GET() {
  try {
    const user = await requireUser();
    requirePermission(user, "manage_users");
    const roles = await prisma.role.findMany({ orderBy: { key: "asc" } });
    return ok({
      roles: roles.map((role) => ({
        id: role.id,
        key: role.key,
        name: role.name,
        description: role.description,
        permissions: parsePermissionSet(role.permissionSet),
      })),
      permissions: PERMISSIONS,
      scopes: SCOPES,
    });
  } catch (error) {
    return jsonError(error);
  }
}

const bodySchema = z.object({
  roleId: z.string().min(1),
  permission: z.enum(PERMISSIONS),
  scope: z.enum(SCOPES),
});

/**
 * PATCH — adjusts a single permission scope.
 *
 * This is how the §5 entries marked "Optional" (operator import, viewer
 * export) are enabled without a code change. Always audited (SEC-010).
 */
export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    requirePermission(user, "manage_users");
    const input = await parseBody(request, bodySchema);

    const role = await prisma.role.findUniqueOrThrow({ where: { id: input.roleId } });
    const permissions = parsePermissionSet(role.permissionSet);
    const previous = permissions[input.permission];
    permissions[input.permission] = input.scope;

    await prisma.role.update({
      where: { id: input.roleId },
      data: { permissionSet: permissions },
    });

    await recordAudit({
      actor: user,
      action: AUDIT_ACTIONS.ROLE_UPDATE,
      entity: "role",
      entityId: input.roleId,
      oldValues: { [input.permission]: previous },
      newValues: { [input.permission]: input.scope, role: role.key },
    });

    return ok({ permissions });
  } catch (error) {
    return jsonError(error);
  }
}
