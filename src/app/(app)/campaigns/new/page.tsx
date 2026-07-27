import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { has } from "@/lib/rbac";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/primitives";
import { CampaignForm } from "@/components/campaign-form";

export const metadata: Metadata = { title: "New campaign" };
export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  const user = await requirePageUser();
  if (!has(user.permissions, "campaigns_write")) redirect("/campaigns");

  const [clients, templates, owners] = await Promise.all([
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.messageTemplate.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      include: { currentVersion: { select: { id: true, version: true, status: true } } },
    }),
    prisma.user.findMany({
      where: { status: "ACTIVE", role: { key: { in: ["ADMIN", "CAMPAIGN_MANAGER"] } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <Page width="narrow">
      <PageHeader
        title="Create a campaign"
        description="Campaign details feed straight into the personalized message every operator copies, so keep the client-facing wording exact."
      />
      <div className="mt-7">
        <CampaignForm
          mode="create"
          currentUserId={user.id}
          clients={clients}
          owners={owners}
          templates={templates.map((template) => ({
            id: template.id,
            name: template.name,
            versionLabel: template.currentVersion
              ? `v${template.currentVersion.version}`
              : "no version",
            approved: template.currentVersion?.status === "APPROVED",
          }))}
        />
      </div>
    </Page>
  );
}
