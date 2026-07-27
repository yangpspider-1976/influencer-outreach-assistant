import { prisma } from "@/lib/db";
import { ApiError, jsonError, ok, requirePermission } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { assertAcceptableUpload, listSheets, parseUpload } from "@/lib/import-parse";
import { suggestMapping } from "@/lib/import-fields";
import { putFile } from "@/lib/storage";
import { assertCampaignAccess } from "@/lib/campaign-service";

/** POST /imports — upload a file and open an import session (FR-007, FR-008). */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    requirePermission(user, "influencers_import");

    const form = await request.formData();
    const file = form.get("file");
    const campaignId = (form.get("campaignId") as string | null) || null;

    if (!(file instanceof File)) {
      throw new ApiError(400, "Select an .xlsx or .csv file to upload.", "FILE_REQUIRED");
    }
    if (campaignId) {
      await assertCampaignAccess(user, campaignId, "influencers_import");
    }

    assertAcceptableUpload(file.name, file.size);
    const data = Buffer.from(await file.arrayBuffer());

    const availableSheets = await listSheets(file.name, data);
    const parsed = await parseUpload(file.name, data, availableSheets[0] ?? null);
    const storedFileKey = await putFile("imports", file.name, data);

    const record = await prisma.import.create({
      data: {
        campaignId,
        originalFileName: file.name,
        storedFileKey,
        fileSizeBytes: file.size,
        sheetName: parsed.sheetName,
        availableSheets,
        headers: parsed.headers,
        mapping: suggestMapping(parsed.headers) as object,
        status: "UPLOADED",
        totalRows: parsed.rows.length,
        uploadedById: user.id,
      },
    });

    await recordAudit({
      actor: user,
      action: AUDIT_ACTIONS.IMPORT_UPLOAD,
      entity: "import",
      entityId: record.id,
      campaignId,
      newValues: { fileName: file.name, sizeBytes: file.size, rows: parsed.rows.length },
    });

    return ok(
      {
        import: {
          id: record.id,
          originalFileName: record.originalFileName,
          sheetName: record.sheetName,
          availableSheets: record.availableSheets,
          headers: record.headers,
          mapping: record.mapping,
          totalRows: record.totalRows,
          campaignId: record.campaignId,
        },
        preview: parsed.rows.slice(0, 5),
      },
      201,
    );
  } catch (error) {
    return jsonError(error);
  }
}
