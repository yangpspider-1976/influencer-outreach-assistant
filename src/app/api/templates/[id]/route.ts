import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, jsonError, ok, parseBody, requirePermission } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { templateInputSchema } from "@/lib/validation";
import { extractTokens } from "@/lib/template";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    requirePermission(user, "campaigns_view");
    const { id } = await params;
    const template = await prisma.messageTemplate.findUnique({
      where: { id },
      include: {
        currentVersion: true,
        versions: { orderBy: { version: "desc" }, include: { approvedBy: { select: { name: true } } } },
        createdBy: { select: { name: true } },
      },
    });
    if (!template) throw new ApiError(404, "Template not found.", "NOT_FOUND");
    return ok({ template });
  } catch (error) {
    return jsonError(error);
  }
}

/** PATCH — saves a new immutable version (FR-005 versioning). */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    requirePermission(user, "templates_write");
    const { id } = await params;
    const input = await parseBody(request, templateInputSchema);

    const template = await prisma.messageTemplate.findUnique({
      where: { id },
      include: {
        // The version the editor loaded and is editing.
        currentVersion: true,
        // Highest version number, so a new version never collides.
        versions: { orderBy: { version: "desc" }, take: 1 },
      },
    });
    if (!template) throw new ApiError(404, "Template not found.", "NOT_FOUND");

    const nextVersion = (template.versions[0]?.version ?? 0) + 1;
    // Compare against the current version (what the user is editing), not the
    // highest-numbered one — they can differ after approving an older version.
    const contentChanged = (template.currentVersion?.content ?? "") !== input.content;
    // Saving identical content must not mint a duplicate version. Metadata
    // (name/platform/language/description) can still be updated in place.
    const metadataChanged =
      template.name !== input.name ||
      template.platform !== input.platform ||
      template.language !== input.language ||
      template.description !== input.description;

    const updated = await prisma.$transaction(async (tx) => {
      if (!contentChanged) {
        return tx.messageTemplate.update({
          where: { id },
          data: {
            name: input.name,
            platform: input.platform,
            language: input.language,
            description: input.description,
          },
          include: { currentVersion: true },
        });
      }
      const version = await tx.templateVersion.create({
        data: {
          templateId: id,
          version: nextVersion,
          content: input.content,
          variables: extractTokens(input.content),
          lockedTokens: input.lockedTokens,
          versionNote: input.versionNote,
        },
      });
      return tx.messageTemplate.update({
        where: { id },
        data: {
          name: input.name,
          platform: input.platform,
          language: input.language,
          description: input.description,
          status: "DRAFT",
          currentVersionId: version.id,
        },
        include: { currentVersion: true },
      });
    });

    // Only audit a real change, and label it accurately.
    if (contentChanged) {
      await recordAudit({
        actor: user,
        action: AUDIT_ACTIONS.TEMPLATE_VERSION_CREATE,
        entity: "message_template",
        entityId: id,
        newValues: { name: input.name, version: nextVersion },
      });
    } else if (metadataChanged) {
      await recordAudit({
        actor: user,
        action: AUDIT_ACTIONS.TEMPLATE_UPDATE,
        entity: "message_template",
        entityId: id,
        newValues: {
          name: input.name,
          platform: input.platform,
          language: input.language,
          description: input.description,
        },
      });
    }

    return ok({
      template: updated,
      versionCreated: contentChanged,
      changed: contentChanged || metadataChanged,
    });
  } catch (error) {
    return jsonError(error);
  }
}

const approveSchema = z.object({ versionId: z.string().min(1) });

/** POST — approve a template version (FR-005, §5 "Approve templates"). */
export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    requirePermission(user, "templates_approve");
    const { id } = await params;
    const { versionId } = await parseBody(request, approveSchema);

    const version = await prisma.templateVersion.findUnique({ where: { id: versionId } });
    if (!version || version.templateId !== id) {
      throw new ApiError(404, "Template version not found.", "NOT_FOUND");
    }

    await prisma.$transaction([
      prisma.templateVersion.update({
        where: { id: versionId },
        data: { status: "APPROVED", approvedById: user.id, approvedAt: new Date() },
      }),
      prisma.messageTemplate.update({
        where: { id },
        data: { status: "APPROVED", currentVersionId: versionId },
      }),
    ]);

    await recordAudit({
      actor: user,
      action: AUDIT_ACTIONS.TEMPLATE_APPROVE,
      entity: "template_version",
      entityId: versionId,
      newValues: { templateId: id, version: version.version },
    });

    return ok({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
