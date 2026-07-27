import { prisma } from "@/lib/db";
import { jsonError, ok, requirePermission } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import type { Prisma } from "@/generated/prisma/client";

/** GET /influencers — searchable influencer database (FR-028). */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    requirePermission(user, "influencers_view");

    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim();
    const category = url.searchParams.get("category")?.trim();
    const location = url.searchParams.get("location")?.trim();
    const channel = url.searchParams.get("channel");
    const dnc = url.searchParams.get("dnc");
    const take = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
    const skip = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);

    const where: Prisma.InfluencerWhereInput = {
      archivedAt: null,
      ...(category ? { category: { contains: category, mode: "insensitive" } } : {}),
      ...(location ? { location: { contains: location, mode: "insensitive" } } : {}),
      ...(dnc === "true" ? { dncFlag: true } : dnc === "false" ? { dncFlag: false } : {}),
      ...(channel ? { profiles: { some: { platform: channel as never } } } : {}),
      ...(search
        ? {
            OR: [
              { displayName: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { profiles: { some: { normalizedUrl: { contains: search.toLowerCase() } } } },
            ],
          }
        : {}),
    };

    const [influencers, total] = await Promise.all([
      prisma.influencer.findMany({
        where,
        orderBy: { displayName: "asc" },
        take,
        skip,
        include: {
          profiles: true,
          tags: { include: { tag: true } },
          _count: { select: { records: true } },
        },
      }),
      prisma.influencer.count({ where }),
    ]);

    return ok({ total, influencers });
  } catch (error) {
    return jsonError(error);
  }
}
