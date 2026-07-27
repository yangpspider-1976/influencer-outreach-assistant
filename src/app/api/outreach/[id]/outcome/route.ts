import { jsonError, ok, parseBody, requirePermission } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { outcomeSchema } from "@/lib/validation";
import { saveOutcome } from "@/lib/outreach-service";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /outreach/{id}/outcome — save Sent / Skip / Invalid / DNC with an
 * optimistic concurrency token (FR-019, AC-006, AC-007, AC-008).
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    requirePermission(user, "outreach_process");
    const { id } = await params;
    const input = await parseBody(request, outcomeSchema);
    const result = await saveOutcome(user, id, input);
    return ok(result);
  } catch (error) {
    return jsonError(error);
  }
}
