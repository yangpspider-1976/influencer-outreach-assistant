import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, jsonError, ok, parseBody } from "@/lib/api";
import { ForbiddenError, requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { resetAndReseedDemoData } from "@/lib/demo-seed";

/**
 * POST /api/admin/reset-demo-data
 *
 * Wipes every campaign, influencer and outreach record, then rebuilds the demo
 * dataset. Irreversible.
 *
 * Four independent guards, because this destroys data:
 *   1. Administrator role — hard-coded, not a grantable permission, so it
 *      cannot be handed to another role through the role editor.
 *   2. Blocked when NODE_ENV=production unless ALLOW_DEMO_RESET=true is set
 *      explicitly in the environment.
 *   3. A typed confirmation phrase in the request body.
 *   4. Audited after the fact (the wipe clears the audit log, so the entry is
 *      written once the new dataset is in place).
 *
 * Users, roles, app settings and skip reasons are preserved, so the acting
 * administrator keeps their session.
 */

export const CONFIRM_PHRASE = "RESET DEMO DATA";

const bodySchema = z.object({
  confirm: z.string(),
});

function assertResetAllowed(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.ALLOW_DEMO_RESET === "true") return;
  throw new ApiError(
    403,
    "Demo data reset is disabled in production. Set ALLOW_DEMO_RESET=true only on a disposable environment.",
    "RESET_DISABLED_IN_PRODUCTION",
  );
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();

    // Guard 1 — administrator only, independent of the permission matrix.
    if (user.roleKey !== "ADMIN") {
      throw new ForbiddenError("Only an administrator can reset the demo data.");
    }

    // Guard 2 — never silently destroy a production database.
    assertResetAllowed();

    // Guard 3 — explicit typed confirmation.
    const input = await parseBody(request, bodySchema);
    if (input.confirm !== CONFIRM_PHRASE) {
      throw new ApiError(
        422,
        `Type "${CONFIRM_PHRASE}" exactly to confirm.`,
        "CONFIRMATION_REQUIRED",
      );
    }

    const before = await prisma.campaignInfluencer.count();
    const startedAt = Date.now();

    const summary = await resetAndReseedDemoData(prisma);

    // Guard 4 — the wipe clears audit_logs, so this entry is written last and
    // becomes the first record of the new dataset's history.
    await recordAudit({
      actor: user,
      action: "admin.demo_data.reset",
      entity: "database",
      entityId: null,
      oldValues: { campaignRecords: before },
      newValues: {
        campaigns: summary.campaigns,
        influencers: summary.influencers,
        campaignRecords: summary.records,
        followUpTasks: summary.followUps,
        durationMs: Date.now() - startedAt,
      },
    });

    return ok({ summary, durationMs: Date.now() - startedAt });
  } catch (error) {
    return jsonError(error);
  }
}
