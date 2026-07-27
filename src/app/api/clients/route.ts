import { prisma } from "@/lib/db";
import { jsonError, ok, requirePermission } from "@/lib/api";
import { requireUser } from "@/lib/auth";

/** GET /clients — used by the campaign form's client picker. */
export async function GET() {
  try {
    const user = await requireUser();
    requirePermission(user, "campaigns_view");
    const clients = await prisma.client.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    return ok({ clients });
  } catch (error) {
    return jsonError(error);
  }
}
