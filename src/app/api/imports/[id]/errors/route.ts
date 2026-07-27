import { prisma } from "@/lib/db";
import { ApiError, jsonError, requirePermission } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { toCsv, exportFileName, type ExportColumn } from "@/lib/spreadsheet";
import type { RowIssue } from "@/lib/import-fields";

type Params = { params: Promise<{ id: string }> };

type ErrorRow = {
  rowNumber: number;
  status: string;
  severity: string;
  field: string;
  code: string;
  message: string;
};

const COLUMNS: ExportColumn<ErrorRow>[] = [
  { key: "rowNumber", header: "Row", value: (r) => r.rowNumber },
  { key: "status", header: "Classification", value: (r) => r.status },
  { key: "severity", header: "Severity", value: (r) => r.severity },
  { key: "field", header: "Field", value: (r) => r.field },
  { key: "code", header: "Code", value: (r) => r.code },
  { key: "message", header: "Message", value: (r) => r.message },
];

/**
 * §8 — "User can download a validation error file before confirming import."
 * Generated through the shared exporter, so it carries the same formula
 * injection protection as every other export (SEC-005).
 */
export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    requirePermission(user, "influencers_import");
    const { id } = await params;

    const record = await prisma.import.findUnique({ where: { id } });
    if (!record) throw new ApiError(404, "Import session not found.", "NOT_FOUND");

    const rows = await prisma.importRow.findMany({
      where: { importId: id, status: { in: ["WARNING", "REJECTED"] } },
      orderBy: { rowNumber: "asc" },
    });

    const flattened: ErrorRow[] = rows.flatMap((row) =>
      (row.issues as unknown as RowIssue[]).map((issue) => ({
        rowNumber: row.rowNumber,
        status: row.status,
        severity: issue.severity,
        field: issue.field ?? "row",
        code: issue.code,
        message: issue.message,
      })),
    );

    const csv = toCsv(flattened, COLUMNS);
    const fileName = exportFileName(`import_validation_${record.originalFileName}`, "CSV");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
