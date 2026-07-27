import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { establishSession, verifyPassword } from "@/lib/auth";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { jsonError, ApiError } from "@/lib/api";
import { loginSchema } from "@/lib/validation";

/** POST /auth/login — authenticate and create a secure session. */
export async function POST(request: Request) {
  try {
    const body = loginSchema.parse(await request.json());

    const user = await prisma.user.findUnique({
      where: { email: body.email },
      include: { role: true },
    });

    // Same message and comparable timing for every failure mode so the
    // endpoint cannot be used to enumerate accounts.
    const passwordOk = user
      ? await verifyPassword(user.passwordHash, body.password)
      : await verifyPassword(
          "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$0000000000000000000000000000000000000000000",
          body.password,
        );

    if (!user || !passwordOk || user.status !== "ACTIVE") {
      await recordAudit({
        actor: null,
        action: AUDIT_ACTIONS.LOGIN_FAILURE,
        entity: "user",
        entityId: user?.id ?? null,
        newValues: { email: body.email, reason: user ? "invalid_or_disabled" : "unknown_user" },
      });
      throw new ApiError(401, "The email or password is incorrect.", "INVALID_CREDENTIALS");
    }

    const sessionId = await establishSession(user.id, user.sessionEpoch);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    await recordAudit({
      actor: { id: user.id, email: user.email, sessionId },
      action: AUDIT_ACTIONS.LOGIN_SUCCESS,
      entity: "user",
      entityId: user.id,
    });

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role.key,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
