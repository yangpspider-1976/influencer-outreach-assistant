import { prisma } from "@/lib/db";
import { ApiError, jsonError, ok, parseBody, requirePermission } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { normalizeProfileUrl } from "@/lib/social-url";
import { discoverySaveSchema } from "@/lib/validation";

/** Save user-reviewed discovery results into the deduplicated influencer database. */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    requirePermission(user, "influencers_import");
    const input = await parseBody(request, discoverySaveSchema);

    const normalizedProfiles = input.profiles.map((profile) => {
      const normalized = normalizeProfileUrl(profile.profileUrl, profile.platform);
      if (!normalized.ok) {
        throw new ApiError(
          422,
          `"${profile.profileUrl}" is not a supported profile URL.`,
          "INVALID_PROFILE_URL",
        );
      }
      return { requested: profile, normalized };
    });

    const saved = await prisma.$transaction(async (tx) => {
      const output: {
        normalizedUrl: string;
        influencerId: string;
        displayName: string;
        created: boolean;
      }[] = [];

      for (const { requested, normalized } of normalizedProfiles) {
        const existing = await tx.socialProfile.findUnique({
          where: {
            platform_normalizedUrl: {
              platform: normalized.platform,
              normalizedUrl: normalized.normalizedUrl,
            },
          },
          select: { influencer: { select: { id: true, displayName: true } } },
        });
        if (existing) {
          output.push({
            normalizedUrl: normalized.normalizedUrl,
            influencerId: existing.influencer.id,
            displayName: existing.influencer.displayName,
            created: false,
          });
          continue;
        }

        const firstName = requested.displayName.startsWith("@")
          ? null
          : requested.displayName.split(/\s+/)[0] || null;
        const influencer = await tx.influencer.create({
          data: {
            displayName: requested.displayName,
            firstName,
            category: input.category,
            location: input.location,
            notes: "Added from Creator discovery. Verify profile details before campaign use.",
            profiles: {
              create: {
                platform: normalized.platform,
                originalUrl: normalized.canonicalUrl,
                normalizedUrl: normalized.normalizedUrl,
                usernameHint: normalized.usernameHint,
                preferredFlag: true,
              },
            },
          },
          select: { id: true, displayName: true },
        });
        output.push({
          normalizedUrl: normalized.normalizedUrl,
          influencerId: influencer.id,
          displayName: influencer.displayName,
          created: true,
        });
      }

      return output;
    });

    for (const result of saved.filter((entry) => entry.created)) {
      await recordAudit({
        actor: user,
        action: AUDIT_ACTIONS.DISCOVERY_SAVE,
        entity: "influencer",
        entityId: result.influencerId,
        newValues: {
          displayName: result.displayName,
          normalizedUrl: result.normalizedUrl,
          category: input.category,
          location: input.location,
          source: "creator_discovery",
        },
      });
    }

    return ok({
      saved,
      created: saved.filter((entry) => entry.created).length,
      linkedExisting: saved.filter((entry) => !entry.created).length,
    });
  } catch (error) {
    return jsonError(error);
  }
}
