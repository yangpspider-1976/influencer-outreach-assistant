import { prisma } from "@/lib/db";
import { ApiError, jsonError, ok, parseBody, requirePermission } from "@/lib/api";
import { hashPassword, isEmailDomainAllowed, requireUser } from "@/lib/auth";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { userInputSchema } from "@/lib/validation";

/** GET /users — used by assignment pickers and the administration screen. */
export async function GET() {
  try {
    const user = await requireUser();
    // Assigning work needs the operator list, so campaign managers may read it.
    if (user.permissions.manage_users === "none" && user.permissions.queue_assign === "none") {
      throw new ApiError(403, "Your role cannot list users.", "FORBIDDEN");
    }
    const users = await prisma.user.findMany({
      orderBy: [{ status: "asc" }, { name: "asc" }],
      include: { role: { select: { key: true, name: true } } },
    });
    return ok({
      users: users.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        status: row.status,
        roleKey: row.role.key,
        roleName: row.role.name,
        lastLoginAt: row.lastLoginAt,
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

/** POST /users — create an account (admin only, §5). */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    requirePermission(user, "manage_users");
    const input = await parseBody(request, userInputSchema);

    if (!input.password) {
      throw new ApiError(422, "An initial password is required.", "PASSWORD_REQUIRED");
    }
    if (!isEmailDomainAllowed(input.email)) {
      throw new ApiError(422, "That email domain is not allowed.", "DOMAIN_NOT_ALLOWED");
    }
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new ApiError(409, "An account with that email already exists.", "EMAIL_TAKEN");
    }

    const role = await prisma.role.findUnique({ where: { key: input.roleKey } });
    if (!role) throw new ApiError(422, "Unknown role.", "UNKNOWN_ROLE");

    const created = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        roleId: role.id,
        passwordHash: await hashPassword(input.password),
      },
    });

    await recordAudit({
      actor: user,
      action: AUDIT_ACTIONS.USER_CREATE,
      entity: "user",
      entityId: created.id,
      newValues: { email: created.email, name: created.name, role: input.roleKey },
    });

    return ok({ user: { id: created.id, email: created.email, name: created.name } }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
