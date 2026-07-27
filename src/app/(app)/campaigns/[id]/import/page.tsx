import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePageUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { has } from "@/lib/rbac";
import { assertCampaignAccess } from "@/lib/campaign-service";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/primitives";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Import influencers" };
export const dynamic = "force-dynamic";

export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;

  if (!has(user.permissions, "influencers_import")) redirect(`/campaigns/${id}`);
  await assertCampaignAccess(user, id, "influencers_import");

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    select: { id: true, name: true, client: { select: { name: true } } },
  });
  if (!campaign) notFound();

  return (
    <Page>
      <PageHeader
        breadcrumb={
          <Link
            href={`/campaigns/${id}`}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-500 transition-colors hover:text-slate-800"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            {campaign.name}
          </Link>
        }
        title="Import influencer list"
        description="Upload an XLSX or CSV list, map the columns, review row-level validation, then commit the rows you selected."
      />
      <div className="mt-7">
        <ImportWizard campaignId={id} campaignName={campaign.name} />
      </div>
    </Page>
  );
}
