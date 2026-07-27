import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Upload } from "lucide-react";
import { requirePageUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { has, type RoleKeyName } from "@/lib/rbac";
import { assertCampaignAccess, checkActivationReadiness } from "@/lib/campaign-service";
import { buildCampaignReport } from "@/lib/reports-service";
import { formatDate, formatDateRange, formatPercent } from "@/lib/format";
import { formatDuration } from "@/lib/metrics";
import { CAMPAIGN_STATUS_META } from "@/lib/status";
import { Page } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import {
  Badge,
  Callout,
  Card,
  CardHeader,
  DefinitionList,
  PageHeader,
  StatTile,
} from "@/components/ui/primitives";
import { TabNav } from "@/components/tab-nav";
import { FunnelBar } from "@/components/funnel-bar";
import { CampaignStatusControl } from "./campaign-status-control";
import { AudienceTable } from "./audience-table";
import { PipelineBoard } from "@/components/pipeline-board";
import { CampaignSettingsTab } from "./settings-tab";

export const metadata: Metadata = { title: "Campaign" };
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export default async function CampaignDetailPage({ params, searchParams }: Props) {
  const user = await requirePageUser();
  const { id } = await params;
  const { tab = "overview" } = await searchParams;

  await assertCampaignAccess(user, id, "campaigns_view");

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      client: true,
      owner: { select: { id: true, name: true, email: true } },
      templateVersion: { include: { template: true } },
      _count: { select: { records: true } },
    },
  });
  if (!campaign) notFound();

  const [report, readiness, operators, imports] = await Promise.all([
    buildCampaignReport({ campaignId: id }),
    checkActivationReadiness(id),
    prisma.user.findMany({
      where: { status: "ACTIVE", role: { key: { in: ["OPERATOR", "CAMPAIGN_MANAGER", "ADMIN"] } } },
      select: { id: true, name: true, role: { select: { key: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.import.findMany({
      where: { campaignId: id },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { uploadedBy: { select: { name: true } } },
    }),
  ]);

  const meta = CAMPAIGN_STATUS_META[campaign.status];
  const canWrite = has(user.permissions, "campaigns_write");
  const canImport = has(user.permissions, "influencers_import");
  const canExport = has(user.permissions, "export_data");

  const base = `/campaigns/${id}`;
  const tabs = [
    { key: "overview", label: "Overview", href: `${base}?tab=overview` },
    {
      key: "audience",
      label: "Audience",
      href: `${base}?tab=audience`,
      count: campaign._count.records,
    },
    {
      key: "pipeline",
      label: "Pipeline",
      href: `${base}?tab=pipeline`,
      count: report.metrics.repliedOrLater,
    },
    { key: "analytics", label: "Analytics", href: `${base}?tab=analytics` },
    { key: "files", label: "Imports & files", href: `${base}?tab=files`, count: imports.length },
    { key: "settings", label: "Settings", href: `${base}?tab=settings` },
  ];

  return (
    <Page>
      <PageHeader
        breadcrumb={
          <Link
            href="/campaigns"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-500 transition-colors hover:text-slate-800"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            All campaigns
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {campaign.name}
            <Badge tone={meta?.tone ?? "neutral"}>{meta?.label ?? campaign.status}</Badge>
          </span>
        }
        description={`${campaign.client.name} · ${campaign.location} · visit ${formatDateRange(
          campaign.visitStart,
          campaign.visitEnd,
        )}`}
        actions={
          <>
            {canImport ? (
              <ButtonLink
                href={`${base}/import`}
                variant="secondary"
                icon={<Upload className="size-4" />}
              >
                Import list
              </ButtonLink>
            ) : null}
            {canExport ? (
              <ButtonLink
                href={`/reports?campaignId=${id}`}
                variant="secondary"
                icon={<Download className="size-4" />}
              >
                Export
              </ButtonLink>
            ) : null}
            {canWrite ? (
              <CampaignStatusControl
                campaignId={id}
                status={campaign.status}
                readiness={readiness}
              />
            ) : null}
          </>
        }
      />

      <div className="mt-6">
        <TabNav tabs={tabs} active={tab} />
      </div>

      {tab === "overview" ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <Card>
              <CardHeader title="Campaign details" />
              <div className="p-5">
                <DefinitionList
                  columns={2}
                  items={[
                    { label: "Client / restaurant", value: campaign.client.name },
                    { label: "Location", value: campaign.location },
                    {
                      label: "Visit period",
                      value: formatDateRange(campaign.visitStart, campaign.visitEnd),
                    },
                    {
                      label: "Application deadline",
                      value: formatDate(campaign.applicationDeadline),
                    },
                    { label: "Compensation", value: campaign.compensation },
                    {
                      label: "Deliverables",
                      value: (
                        <span className="whitespace-pre-line">{campaign.deliverables}</span>
                      ),
                    },
                    { label: "Target category", value: campaign.targetCategory || "—" },
                    { label: "Target location", value: campaign.targetLocation || "—" },
                    { label: "Internal owner", value: campaign.owner.name },
                    {
                      label: "Message template",
                      value: campaign.templateVersion ? (
                        <Link
                          href={`/templates/${campaign.templateVersion.templateId}`}
                          className="font-medium text-brand-600 hover:text-brand-700"
                        >
                          {campaign.templateVersion.template.name} · v
                          {campaign.templateVersion.version}
                        </Link>
                      ) : (
                        <span className="text-rose-600">Not selected</span>
                      ),
                    },
                    {
                      label: "Follow-up reminders",
                      value:
                        campaign.followUpOffsetDays.length > 0
                          ? campaign.followUpOffsetDays
                              .map((day) => `day ${day}`)
                              .join(", ")
                          : "None configured",
                    },
                    {
                      label: "Brief link in copy",
                      value: campaign.briefLinkEnabled ? "Enabled" : "Disabled",
                    },
                  ]}
                />
                {campaign.notes ? (
                  <div className="mt-6 rounded-lg bg-slate-50 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Internal notes
                    </p>
                    <p className="mt-1.5 whitespace-pre-line text-[13px] leading-6 text-slate-700">
                      {campaign.notes}
                    </p>
                  </div>
                ) : null}
              </div>
            </Card>

            <Card>
              <CardHeader title="Recruitment funnel" />
              <div className="p-5">
                <FunnelBar counts={report.statusCounts} total={report.metrics.total} />
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <StatTile label="Audience" value={report.metrics.total} />
              <StatTile label="Assigned" value={report.metrics.assigned} />
              <StatTile label="Sent" value={report.metrics.sentOrLater} />
              <StatTile label="Confirmed" value={report.metrics.confirmed} accent />
            </div>

            {readiness.blockers.length > 0 && campaign.status === "DRAFT" ? (
              <Callout tone="warning" title="Not ready to activate">
                <ul className="mt-1.5 list-disc space-y-1 pl-4">
                  {readiness.blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              </Callout>
            ) : null}

            {readiness.warnings.length > 0 ? (
              <Callout tone="info" title="Worth checking">
                <ul className="mt-1.5 list-disc space-y-1 pl-4">
                  {readiness.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </Callout>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "audience" ? (
        <div className="mt-6">
          <AudienceTable
            campaignId={id}
            operators={operators.map((operator) => ({
              id: operator.id,
              name: operator.name,
              roleKey: operator.role.key as RoleKeyName,
            }))}
            canAssign={has(user.permissions, "queue_assign")}
            canOverrideDnc={user.permissions.dnc_override === "all"}
            canAdd={has(user.permissions, "influencers_import")}
          />
        </div>
      ) : null}

      {tab === "pipeline" ? (
        <div className="mt-6">
          <PipelineBoard
            campaignId={id}
            canUpdate={has(user.permissions, "pipeline_update")}
          />
        </div>
      ) : null}

      {tab === "analytics" ? (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
              hint={`${report.metrics.invalid} invalid accounts`}
            />
            <StatTile
              label="Follow-up completion"
              value={formatPercent(report.metrics.followUpCompletionRate)}
            />
            <StatTile
              label="Avg. processing time"
              value={formatDuration(report.metrics.averageProcessingMs)}
              hint="Queue open to outcome saved"
            />
            <StatTile label="No response" value={report.metrics.noResponse} />
          </div>

          <Card>
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
                        No records have been assigned yet.
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
        </div>
      ) : null}

      {tab === "files" ? (
        <Card className="mt-6">
          <CardHeader
            title="Import history"
            description="Every uploaded list, its mapping and the resulting row counts."
            action={
              canImport ? (
                <ButtonLink href={`${base}/import`} size="sm">
                  New import
                </ButtonLink>
              ) : null
            }
          />
          {imports.length === 0 ? (
            <p className="px-5 py-12 text-center text-[13px] text-slate-400">
              No influencer lists have been imported into this campaign yet.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {imports.map((record) => (
                <li key={record.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-slate-900">
                      {record.originalFileName}
                    </p>
                    <p className="mt-0.5 text-[12px] text-slate-500">
                      {record.uploadedBy.name} · {formatDate(record.createdAt)}
                      {record.sheetName ? ` · sheet "${record.sheetName}"` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[12px]">
                    <Badge tone="positive">{record.validRows} valid</Badge>
                    <Badge tone="warning">{record.warningRows} warning</Badge>
                    <Badge tone="danger">{record.rejectedRows} rejected</Badge>
                    <Badge tone={record.status === "COMMITTED" ? "info" : "neutral"}>
                      {record.status === "COMMITTED"
                        ? `${record.importedRows} imported`
                        : record.status}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {tab === "settings" ? (
        <div className="mt-6">
          <CampaignSettingsTab campaignId={id} canWrite={canWrite} />
        </div>
      ) : null}
    </Page>
  );
}
