import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, ok, parseBody, requirePermission } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

/** §10 — Skip requires a reason from this controlled, admin-managed list. */
export async function GET() {
  try {
    await requireUser();
    const reasons = await prisma.skipReason.findMany({ orderBy: { sortOrder: "asc" } });
    return ok({ reasons });
  } catch (error) {
    return jsonError(error);
  }
}

const createSchema = z.object({ label: z.string().trim().min(3).max(150) });

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    requirePermission(user, "manage_settings");
    const { label } = await parseBody(request, createSchema);
    const count = await prisma.skipReason.count();
    const reason = await prisma.skipReason.create({ data: { label, sortOrder: count } });
    await recordAudit({
      actor: user,
      action: "skip_reason.create",
      entity: "skip_reason",
      entityId: reason.id,
      newValues: { label },
    });
    return ok({ reason }, 201);
  } catch (error) {
    return jsonError(error);
  }
}

const updateSchema = z.object({ id: z.string().min(1), active: z.boolean() });

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    requirePermission(user, "manage_settings");
    const input = await parseBody(request, updateSchema);
    const reason = await prisma.skipReason.update({
      where: { id: input.id },
      data: { active: input.active },
    });
    await recordAudit({
      actor: user,
      action: "skip_reason.update",
      entity: "skip_reason",
      entityId: reason.id,
      newValues: { active: input.active },
    });
    return ok({ reason });
  } catch (error) {
    return jsonError(error);
  }
}
