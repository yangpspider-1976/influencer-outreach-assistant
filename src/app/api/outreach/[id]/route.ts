import { jsonError, ok, requirePermission } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { acquireLock, loadWorkspaceRecord } from "@/lib/outreach-service";
import { buildWorkspacePayload } from "@/lib/workspace-payload";

type Params = { params: Promise<{ id: string }> };

/** GET /outreach/{campaignInfluencerId} — workspace data and rendered message. */
export async function GET(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    requirePermission(user, "outreach_process");
    const { id } = await params;

    // Authorization first: loadWorkspaceRecord enforces campaign scope (SEC-004).
    let record = await loadWorkspaceRecord(user, id);

    // Taking the short processing lock is opt-in so read-only previews (for
    // example from the pipeline board) never block another operator.
    if (new URL(request.url).searchParams.get("lock") === "1") {
      await acquireLock(id, user.id);
      record = await loadWorkspaceRecord(user, id);
    }

    return ok(await buildWorkspacePayload(record));
  } catch (error) {
    return jsonError(error);
  }
}
