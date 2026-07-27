import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { requirePageUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isDiscoveryConfigured } from "@/lib/discovery-provider";
import { DISCOVERY_LOCATIONS, mergeCategoryOptions } from "@/lib/discovery-options";
import { canUseCreatorDiscovery, has } from "@/lib/rbac";
import { Page } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/primitives";
import { DiscoveryWorkspace } from "./discovery-workspace";

export const metadata: Metadata = { title: "Creator discovery" };
export const dynamic = "force-dynamic";

export default async function DiscoveryPage() {
  const user = await requirePageUser();
  if (!canUseCreatorDiscovery(user.permissions)) redirect("/influencers");

  // Category options merge the canonical niches with any custom categories
  // already present in the database. Locations are scoped to Metro Manila.
  const dbCategories = await prisma.influencer.findMany({
    where: { category: { not: "" }, archivedAt: null },
    distinct: ["category"],
    select: { category: true },
    orderBy: { category: "asc" },
    take: 100,
  });
  const categoryOptions = mergeCategoryOptions(dbCategories.map((row) => row.category));

  return (
    <Page>
      <PageHeader
        title="Creator discovery"
        description="Find public Instagram and Facebook creators with guided browser search or the configured automatic provider, then review each profile before saving it."
        actions={
          <ButtonLink
            href="/influencers"
            variant="secondary"
            icon={<Users className="size-4" aria-hidden />}
          >
            Influencer database
          </ButtonLink>
        }
      />

      <DiscoveryWorkspace
        configured={isDiscoveryConfigured()}
        canSave={has(user.permissions, "influencers_import")}
        categoryOptions={categoryOptions}
        locationOptions={DISCOVERY_LOCATIONS}
      />
    </Page>
  );
}
