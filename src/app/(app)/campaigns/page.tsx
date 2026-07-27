import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { requirePageUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { has } from "@/lib/rbac";
import { visibleCampaignFilter } from "@/lib/campaign-service";
import { formatDate, formatDateRange } from "@/lib/format";
import { CAMPAIGN_STATUS_META, COMPLETED_OUTCOME_STATUSES } from "@/lib/status";
import { Page } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  ProgressBar,
  TableShell,
  Td,
  Th,
  Tr,
} from "@/components/ui/primitives";
import { CampaignFilters } from "./campaign-filters";
import type { Prisma } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Campaigns" };
export const dynamic = "force-dynamic";

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; ownerId?: string }>;
}) {
  const user = await requirePageUser();
  const params = await searchParams;

  const where: Prisma.CampaignWhereInput = {
    ...visibleCampaignFilter(user),
    ...(params.status ? { status: params.status as never } : {}),
    ...(params.ownerId ? { ownerId: params.ownerId } : {}),
    ...(params.search
      ? {
          OR: [
            { name: { contains: params.search, mode: "insensitive" } },
            { client: { name: { contains: params.search, mode: "insensitive" } } },
            { location: { contains: params.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [campaigns, owners] = await Promise.all([
    prisma.campaign.findMany({
      where,
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      include: {
        client: { select: { name: true } },
        owner: { select: { id: true, name: true } },
        records: { select: { outreachStatus: true } },
      },
    }),
    prisma.user.findMany({
      where: { ownedCampaigns: { some: {} } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <Page>
      <PageHeader
        title="Campaigns"
        description="Every restaurant and brand campaign you have access to, with live outreach progress."
        actions={
          has(user.permissions, "campaigns_write") ? (
            <ButtonLink href="/campaigns/new">
              New campaign
            </ButtonLink>
          ) : null
        }
      />

      <Card className="mt-7">
        <CampaignFilters owners={owners} />

        {campaigns.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="size-5" aria-hidden />}
            title="No campaigns match these filters"
            description="Adjust the search or status filter, or create a new campaign."
          />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Campaign</Th>
                <Th>Status</Th>
                <Th>Visit period</Th>
                <Th>Owner</Th>
                <Th className="text-right">Audience</Th>
                <Th className="w-48">Progress</Th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => {
                const total = campaign.records.length;
                const completed = campaign.records.filter((record) =>
                  COMPLETED_OUTCOME_STATUSES.includes(record.outreachStatus as never),
                ).length;
                const percent = total ? Math.round((completed / total) * 100) : 0;
                const meta = CAMPAIGN_STATUS_META[campaign.status];
                return (
                  <Tr key={campaign.id}>
                    <Td>
                      <Link
                        href={`/campaigns/${campaign.id}`}
                        className="font-medium text-slate-900 hover:text-brand-700"
                      >
                        {campaign.name}
                      </Link>
                      <p className="mt-0.5 text-[12px] text-slate-500">
                        {campaign.client.name} · {campaign.location}
                      </p>
                    </Td>
                    <Td>
                      <Badge tone={meta?.tone ?? "neutral"}>{meta?.label ?? campaign.status}</Badge>
                    </Td>
                    <Td className="whitespace-nowrap text-[13px]">
                      {formatDateRange(campaign.visitStart, campaign.visitEnd)}
                      {campaign.applicationDeadline ? (
                        <p className="mt-0.5 text-[12px] text-slate-400">
                          Apply by {formatDate(campaign.applicationDeadline)}
                        </p>
                      ) : null}
                    </Td>
                    <Td className="whitespace-nowrap text-[13px]">{campaign.owner.name}</Td>
                    <Td className="text-right tabular-nums">{total}</Td>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <ProgressBar value={percent} className="flex-1" />
                        <span className="w-10 shrink-0 text-right text-[12px] font-medium tabular-nums text-slate-600">
                          {percent}%
                        </span>
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </TableShell>
        )}
      </Card>
    </Page>
  );
}
