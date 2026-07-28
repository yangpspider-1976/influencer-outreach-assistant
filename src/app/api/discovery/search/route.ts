import { prisma } from "@/lib/db";
import { jsonError, ok, parseBody } from "@/lib/api";
import { ForbiddenError, requireUser } from "@/lib/auth";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { searchCreatorProfiles } from "@/lib/discovery-provider";
import { canUseCreatorDiscovery, has } from "@/lib/rbac";
import { discoverySearchSchema } from "@/lib/validation";

/** Search public web-index results for reviewable social profile URLs. */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!canUseCreatorDiscovery(user.permissions)) {
      throw new ForbiddenError("Your role cannot use Creator discovery.");
    }
    const input = await parseBody(request, discoverySearchSchema);
    const discovery = await searchCreatorProfiles(input);

    const existing =
      has(user.permissions, "influencers_import") && discovery.results.length > 0
        ? await prisma.socialProfile.findMany({
            where: {
              OR: discovery.results.map((result) => ({
                platform: result.platform,
                normalizedUrl: result.normalizedUrl,
              })),
            },
            select: {
              platform: true,
              normalizedUrl: true,
              influencer: { select: { id: true, displayName: true } },
            },
          })
        : [];
    const existingByProfile = new Map(
      existing.map((profile) => [
        `${profile.platform}:${profile.normalizedUrl}`,
        profile.influencer,
      ]),
    );
    const results = discovery.results.map((result) => ({
      ...result,
      existingInfluencer:
        existingByProfile.get(`${result.platform}:${result.normalizedUrl}`) ?? null,
    }));

    await recordAudit({
      actor: user,
      action: AUDIT_ACTIONS.DISCOVERY_SEARCH,
      entity: "influencer",
      newValues: {
        provider: discovery.provider,
        keywords: input.keywords,
        categories: input.categories,
        locations: input.locations,
        channels: input.channels,
        requestedLimit: input.limit,
        resultCount: results.length,
      },
    });

    return ok({
      provider: discovery.provider,
      query: discovery.query,
      requestedLimit: input.limit,
      results,
    });
  } catch (error) {
    return jsonError(error);
  }
}
