import { NextResponse } from "next/server";
import { destroySession, getCurrentUser } from "@/lib/auth";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { jsonError } from "@/lib/api";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (user) {
      await recordAudit({
        actor: user,
        action: AUDIT_ACTIONS.LOGOUT,
        entity: "user",
        entityId: user.id,
      });
    }
    await destroySession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
