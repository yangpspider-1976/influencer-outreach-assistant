import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { has, hasScope } from "@/lib/rbac";
import { visibleCampaignFilter } from "@/lib/campaign-service";
import { buildCampaignReport } from "@/lib/reports-service";
import { formatPercent } from "@/lib/format";
import { formatDuration } from "@/lib/metrics";
import { Page } from "@/components/ui/page";
import {
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatTile,
} from "@/components/ui/primitives";
import { FunnelBar } from "@/components/funnel-bar";
import { CampaignPicker } from "@/components/campaign-picker";
import { ExportButton } from "@/components/export-button";
import { DailyChart } from "@/components/daily-chart";
import { ExportHistory } from "./export-history";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ campaignId?: string; from?: string; to?: string }>;
}) {
  const user = await requirePageUser();
  if (!has(user.permissions, "reports_view")) redirect("/dashboard");

  const params = await searchParams;

  const campaigns = await prisma.campaign.findMany({
    where: visibleCampaignFilter(user),
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, client: { select: { name: true } } },
  });

  const campaignId = params.campaignId ?? campaigns[0]?.id ?? null;

  if (!campaignId) {
    return (
      <Page>
        <PageHeader title="Reports" description="Campaign funnel and operator productivity." />
        <Card className="mt-7">
          <EmptyState
            title="No campaigns to report on"
            description="Create and activate a campaign to see outreach metrics."
          />
        </Card>
      </Page>
    );
  }

  const report = await buildCampaignReport({
    campaignId,
    operatorId: hasScope(user.permissions, "reports_view", "all") ? null : user.id,
    from: params.from ? new Date(params.from) : null,
    to: params.to ? new Date(params.to) : null,
  });

  return (
    <Page>
      <PageHeader
        title="Reports"
        description="Every figure follows the reporting formulas defined in the work order."
        actions={
          <>
            <CampaignPicker
              basePath="/reports"
              value={campaignId}
              campaigns={campaigns.map((campaign) => ({
                id: campaign.id,
                label: `${campaign.name} · ${campaign.client.name}`,
              }))}
            />
            {has(user.permissions, "export_data") ? (
              <ExportButton
                entity="campaign_records"
                filters={{ campaignId }}
                label="Export records"
              />
            ) : null}
          </>
        }
      />

      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Outreach completion"
          value={formatPercent(report.metrics.outreachCompletionRate)}
          hint={`${report.metrics.completed} of ${report.metrics.assigned} assigned`}
        />
        <StatTile
          label="Reply rate"
          value={formatPercent(report.metrics.replyRate)}
          hint={`${report.metrics.repliedOrLater} of ${report.metrics.sentOrLater} sent`}
        />
        <StatTile
          label="Interest rate"
          value={formatPercent(report.metrics.interestRate)}
          hint={`${report.metrics.interestedOrLater} of ${report.metrics.repliedOrLater} replies`}
        />
        <StatTile
          label="Confirmation rate"
          value={formatPercent(report.metrics.confirmationRate)}
          hint={`${report.metrics.confirmed} confirmed`}
          accent
        />
        <StatTile
          label="Invalid rate"
          value={formatPercent(report.metrics.invalidRate)}
          hint={`${report.metrics.invalid} of ${report.metrics.processed} processed`}
        />
        <StatTile
          label="Follow-up completion"
          value={formatPercent(report.metrics.followUpCompletionRate)}
        />
        <StatTile
          label="Avg. processing time"
          value={formatDuration(report.metrics.averageProcessingMs)}
          hint="Abandoned sessions excluded"
        />
        <StatTile label="No response" value={report.metrics.noResponse} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Daily outreach" description="Outcomes recorded over the last 14 days." />
          <div className="p-5">
            <DailyChart data={report.daily} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Funnel" />
          <div className="p-5">
            <FunnelBar counts={report.statusCounts} total={report.metrics.total} />
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Operator productivity" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-2.5">Operator</th>
                <th className="px-4 py-2.5 text-right">Assigned</th>
                <th className="px-4 py-2.5 text-right">Completed</th>
                <th className="px-4 py-2.5 text-right">Sent</th>
                <th className="px-4 py-2.5 text-right">Confirmed</th>
                <th className="px-4 py-2.5 text-right">Completion</th>
                <th className="px-4 py-2.5 text-right">Avg. time</th>
              </tr>
            </thead>
            <tbody>
              {report.operators.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-[13px] text-slate-400">
                    No assigned records in this campaign.
                  </td>
                </tr>
              ) : (
                report.operators.map((row) => (
                  <tr key={row.operatorId} className="border-b border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-800">{row.operatorName}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.assigned}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.completed}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.sent}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.confirmed}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatPercent(row.completionRate)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatDuration(row.averageProcessingMs)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {has(user.permissions, "export_data") ? (
        <div className="mt-6">
          <ExportHistory />
        </div>
      ) : null}
    </Page>
  );
}
