import { z } from "zod";
import { jsonError, ok, parseBody, requirePermission } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { recordWorkflowEvent } from "@/lib/outreach-service";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({ kind: z.enum(["copy", "profile_open"]).default("copy") });

/**
 * POST /outreach/{id}/copy-event — records a workflow analytics timestamp.
 *
 * AC-006 — neither copying the message nor opening the profile changes the
 * outreach status or implies that a DM was sent.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    requirePermission(user, "outreach_process");
    const { id } = await params;
    const { kind } = await parseBody(request, bodySchema);
    await recordWorkflowEvent(user, id, kind);
    return ok({ ok: true, statusChanged: false });
  } catch (error) {
    return jsonError(error);
  }
}
