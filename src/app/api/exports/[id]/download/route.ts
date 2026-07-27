import { prisma } from "@/lib/db";
import { ApiError, jsonError, requirePermission } from "@/lib/api";
import { ForbiddenError, requireUser } from "@/lib/auth";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { contentTypeFor, getFile } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /exports/{id}/download — streams a generated file from private storage.
 * The file is never reachable through an unauthenticated URL (SEC-008) and
 * every download is audited (SEC-010).
 */
export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    requirePermission(user, "export_data");
    const { id } = await params;

    const job = await prisma.exportJob.findUnique({ where: { id } });
    if (!job) throw new ApiError(404, "Export not found.", "NOT_FOUND");
    if (job.requestedById !== user.id && user.permissions.export_data !== "all") {
      throw new ForbiddenError("This export belongs to another user.");
    }
    if (job.status !== "COMPLETED" || !job.storedFileKey || !job.fileName) {
      throw new ApiError(409, "This export is not ready yet.", "EXPORT_NOT_READY");
    }

    const data = await getFile(job.storedFileKey);

    await recordAudit({
      actor: user,
      action: AUDIT_ACTIONS.EXPORT_DOWNLOAD,
      entity: "export_job",
      entityId: job.id,
      newValues: { fileName: job.fileName, rowCount: job.rowCount },
    });

    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": contentTypeFor(job.fileName),
        "Content-Disposition": `attachment; filename="${job.fileName}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
