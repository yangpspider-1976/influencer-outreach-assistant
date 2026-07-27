import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { has } from "@/lib/rbac";
import { visibleCampaignFilter } from "@/lib/campaign-service";
import { Page } from "@/components/ui/page";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { PipelineBoard } from "@/components/pipeline-board";
import { CampaignPicker } from "@/components/campaign-picker";

export const metadata: Metadata = { title: "Pipeline" };
export const dynamic = "force-dynamic";

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ campaignId?: string }>;
}) {
  const user = await requirePageUser();
  if (!has(user.permissions, "campaigns_view")) redirect("/dashboard");

  const { campaignId } = await searchParams;

  const campaigns = await prisma.campaign.findMany({
    where: { ...visibleCampaignFilter(user), status: { in: ["ACTIVE", "PAUSED", "COMPLETED"] } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, client: { select: { name: true } } },
  });

  const selected = campaignId ?? campaigns[0]?.id ?? null;

  return (
    <Page width="full" className="max-w-[1700px]">
      <PageHeader
        title="Recruitment pipeline"
        description="The recruitment funnel from sent through confirmation. Move a Sent · awaiting reply card to Replied when a creator responds — that also cancels their pending follow-ups."
        actions={
          campaigns.length > 0 ? (
            <CampaignPicker
              basePath="/pipeline"
              campaigns={campaigns.map((campaign) => ({
                id: campaign.id,
                label: `${campaign.name} · ${campaign.client.name}`,
              }))}
              value={selected}
            />
          ) : null
        }
      />

      <div className="mt-7">
        {selected ? (
          <PipelineBoard
            campaignId={selected}
            canUpdate={has(user.permissions, "pipeline_update")}
          />
        ) : (
          <Card>
            <EmptyState
              title="No campaigns to show"
              description="Activate a campaign to start tracking its recruitment pipeline."
            />
          </Card>
        )}
      </div>
    </Page>
  );
}
