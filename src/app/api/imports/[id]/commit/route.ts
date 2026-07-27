import { jsonError, ok, parseBody, requirePermission } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { commitSchema } from "@/lib/validation";
import { commitImport } from "@/lib/import-service";

type Params = { params: Promise<{ id: string }> };

/** POST /imports/{id}/commit — transactional commit of selected rows (AC-002). */
export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    requirePermission(user, "influencers_import");
    const { id } = await params;
    const input = await parseBody(request, commitSchema);
    const result = await commitImport(id, input.rowIds, user);
    return ok(result);
  } catch (error) {
    return jsonError(error);
  }
}
