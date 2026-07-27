import { prisma } from "@/lib/db";
import { jsonError, ok, parseBody, requirePermission } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { exportSchema } from "@/lib/validation";
import { createExport, type ExportEntity } from "@/lib/export-service";

/** POST /exports — create an authorized CSV/XLSX export (FR-026, AC-011). */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    requirePermission(user, "export_data");
    const input = await parseBody(request, exportSchema);
    const result = await createExport(
      user,
      input.entity as ExportEntity,
      input.format,
      input.filters,
    );
    return ok(result, 201);
  } catch (error) {
    return jsonError(error);
  }
}

/** GET /exports — recent export jobs for the caller. */
export async function GET() {
  try {
    const user = await requireUser();
    requirePermission(user, "export_data");
    const jobs = await prisma.exportJob.findMany({
      where: { requestedById: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return ok({ jobs });
  } catch (error) {
    return jsonError(error);
  }
}
