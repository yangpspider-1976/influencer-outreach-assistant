import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { jsonError, ok, parseBody, requirePermission } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";

const bodySchema = z.object({
  key: z.string().min(1).max(100),
  value: z.union([z.string().max(2000), z.number(), z.boolean()]),
});

export async function GET() {
  try {
    const user = await requireUser();
    requirePermission(user, "manage_settings");
    const settings = await prisma.appSetting.findMany({ orderBy: { key: "asc" } });
    return ok({ settings });
  } catch (error) {
    return jsonError(error);
  }
}

/** PATCH — administrator-managed retention and organization settings (SEC-010). */
export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    requirePermission(user, "manage_settings");
    const input = await parseBody(request, bodySchema);

    const existing = await prisma.appSetting.findUnique({ where: { key: input.key } });
    const setting = await prisma.appSetting.upsert({
      where: { key: input.key },
      update: { value: input.value as Prisma.InputJsonValue },
      create: { key: input.key, value: input.value as Prisma.InputJsonValue },
    });

    await recordAudit({
      actor: user,
      action: AUDIT_ACTIONS.SETTING_UPDATE,
      entity: "app_setting",
      entityId: input.key,
      oldValues: { value: existing?.value ?? null },
      newValues: { value: input.value },
    });

    return ok({ setting });
  } catch (error) {
    return jsonError(error);
  }
}
