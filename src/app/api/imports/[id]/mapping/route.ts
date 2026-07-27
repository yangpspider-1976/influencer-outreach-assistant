import { prisma } from "@/lib/db";
import { ApiError, jsonError, ok, parseBody, requirePermission } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { mappingSchema } from "@/lib/validation";
import { runValidation } from "@/lib/import-service";
import type { ColumnMapping } from "@/lib/import-fields";

type Params = { params: Promise<{ id: string }> };

/** POST /imports/{id}/mapping — save the mapping and run validation (FR-009). */
export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    requirePermission(user, "influencers_import");
    const { id } = await params;

    const record = await prisma.import.findUnique({ where: { id } });
    if (!record) throw new ApiError(404, "Import session not found.", "NOT_FOUND");
    if (record.uploadedById !== user.id && user.permissions.influencers_import !== "all") {
      throw new ApiError(403, "This import belongs to another user.", "FORBIDDEN");
    }
    if (record.status === "COMMITTED") {
      throw new ApiError(409, "This import has already been committed.", "ALREADY_COMMITTED");
    }

    const input = await parseBody(request, mappingSchema);

    if (input.sheetName !== undefined && input.sheetName !== record.sheetName) {
      await prisma.import.update({ where: { id }, data: { sheetName: input.sheetName } });
    }

    await runValidation(id, input.mapping as ColumnMapping);

    await recordAudit({
      actor: user,
      action: AUDIT_ACTIONS.IMPORT_MAPPING,
      entity: "import",
      entityId: id,
      campaignId: record.campaignId,
      newValues: { mapping: input.mapping, sheetName: input.sheetName ?? record.sheetName },
    });

    const [updated, rows] = await Promise.all([
      prisma.import.findUnique({ where: { id } }),
      prisma.importRow.findMany({ where: { importId: id }, orderBy: { rowNumber: "asc" } }),
    ]);

    return ok({ import: updated, rows });
  } catch (error) {
    return jsonError(error);
  }
}
