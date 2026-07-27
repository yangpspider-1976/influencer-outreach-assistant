import { prisma } from "@/lib/db";
import { jsonError, ok, parseBody, requirePermission } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { templateInputSchema } from "@/lib/validation";
import { extractTokens } from "@/lib/template";

/** GET /templates — approved and draft templates (FR-005). */
export async function GET() {
  try {
    const user = await requireUser();
    requirePermission(user, "campaigns_view");
    const templates = await prisma.messageTemplate.findMany({
      where: { archivedAt: null },
      orderBy: { updatedAt: "desc" },
      include: {
        currentVersion: true,
        createdBy: { select: { id: true, name: true } },
        _count: { select: { versions: true } },
      },
    });
    return ok({ templates });
  } catch (error) {
    return jsonError(error);
  }
}

/** POST /templates — create a template with its first version (FR-005). */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    requirePermission(user, "templates_write");
    const input = await parseBody(request, templateInputSchema);

    const template = await prisma.$transaction(async (tx) => {
      const created = await tx.messageTemplate.create({
        data: {
          name: input.name,
          platform: input.platform,
          language: input.language,
          description: input.description,
          createdById: user.id,
        },
      });
      const version = await tx.templateVersion.create({
        data: {
          templateId: created.id,
          version: 1,
          content: input.content,
          variables: extractTokens(input.content),
          lockedTokens: input.lockedTokens,
          versionNote: input.versionNote,
        },
      });
      return tx.messageTemplate.update({
        where: { id: created.id },
        data: { currentVersionId: version.id },
        include: { currentVersion: true },
      });
    });

    await recordAudit({
      actor: user,
      action: AUDIT_ACTIONS.TEMPLATE_CREATE,
      entity: "message_template",
      entityId: template.id,
      newValues: { name: template.name, platform: template.platform },
    });

    return ok({ template }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
