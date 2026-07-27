import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bell, Inbox, ShieldAlert } from "lucide-react";
import { requirePageUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { has } from "@/lib/rbac";
import { visibleCampaignFilter } from "@/lib/campaign-service";
import { buildCampaignReport } from "@/lib/reports-service";
import { formatDate, formatPercent, relativeTime } from "@/lib/format";
import { Page } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import {
  Badge,
  Callout,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  ProgressBar,
  StatTile,
} from "@/components/ui/primitives";
import { CAMPAIGN_STATUS_META, COMPLETED_OUTCOME_STATUSES } from "@/lib/status";
import { FunnelBar } from "@/components/funnel-bar";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requirePageUser();
  const canCreate = has(user.permissions, "campaigns_write");
  const seesAllQueues = user.permissions.outreach_process === "all";

  const [campaigns, queueCount, dueFollowUps, recentActivity, dncCount] = await Promise.all([
    prisma.campaign.findMany({
      where: { ...visibleCampaignFilter(user), status: { in: ["ACTIVE", "PAUSED", "DRAFT"] } },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 6,
      include: {
        client: { select: { name: true } },
        owner: { select: { name: true } },
        // Statuses (not just a count) so the card can show real completion.
        records: { select: { outreachStatus: true } },
      },
    }),
    prisma.campaignInfluencer.count({
      where: {
        campaign: { status: "ACTIVE" },
        outreachStatus: { in: ["READY", "FOLLOW_UP_DUE"] },
        assigneeId: user.id,
        OR: [{ influencer: { dncFlag: false } }, { dncOverrideById: { not: null } }],
      },
    }),
    prisma.followUpTask.findMany({
      where: {
        status: "PENDING",
        dueAt: { lte: new Date() },
        ...(seesAllQueues ? {} : { assignedToId: user.id }),
      },
      orderBy: { dueAt: "asc" },
      take: 6,
      include: {
        campaignInfluencer: {
          select: {
            id: true,
            campaign: { select: { name: true } },
            influencer: { select: { displayName: true } },
          },
        },
      },
    }),
    prisma.auditLog.findMany({
      where: has(user.permissions, "audit_view") ? {} : { actorId: user.id },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.influencer.count({ where: { dncFlag: true } }),
  ]);

  const primaryCampaign = campaigns.find((campaign) => campaign.status === "ACTIVE");
  const report = primaryCampaign
    ? await buildCampaignReport({ campaignId: primaryCampaign.id })
    : null;

  return (
    <Page>
      <PageHeader
        title={`Good to see you, ${user.name.split(" ")[0]}`}
        description="Your outreach queue, due follow-ups and live campaign performance in one place."
        actions={
          <>
            {has(user.permissions, "outreach_process") ? (
              <ButtonLink href="/outreach" variant={queueCount > 0 ? "primary" : "secondary"}>
                Open outreach workspace
                <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
            ) : null}
            {canCreate ? (
              <ButtonLink href="/campaigns/new" variant="secondary">
                New campaign
              </ButtonLink>
            ) : null}
          </>
        }
      />

      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Ready in your queue"
          value={queueCount}
          hint={queueCount > 0 ? "Assigned and eligible right now" : "Nothing assigned to you"}
          accent={queueCount > 0}
        />
        <StatTile
          label="Follow-ups due"
          value={dueFollowUps.length}
          hint={seesAllQueues ? "Across all operators" : "Assigned to you"}
        />
        <StatTile
          label="Active campaigns"
          value={campaigns.filter((campaign) => campaign.status === "ACTIVE").length}
          hint={`${campaigns.length} visible to you`}
        />
        <StatTile
          label="Do-not-contact records"
          value={dncCount}
          hint="Blocked from every future campaign"
        />
      </div>

      <div className="mt-7 grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader
              title="Campaigns"
              description="Progress across the campaigns you can see."
              action={
                <ButtonLink href="/campaigns" variant="ghost" size="sm">
                  View all
                </ButtonLink>
              }
            />
            {campaigns.length === 0 ? (
              <EmptyState
                icon={<Inbox className="size-5" aria-hidden />}
                title="No campaigns yet"
                description="Create a campaign, import an influencer list and assign the queue to your operators."
                action={
                  canCreate ? (
                    <ButtonLink href="/campaigns/new" size="sm">
                      Create the first campaign
                    </ButtonLink>
                  ) : null
                }
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {campaigns.map((campaign) => {
                  const meta = CAMPAIGN_STATUS_META[campaign.status];
                  const total = campaign.records.length;
                  const completed = campaign.records.filter((record) =>
                    COMPLETED_OUTCOME_STATUSES.includes(record.outreachStatus as never),
                  ).length;
                  const percent = total ? Math.round((completed / total) * 100) : 0;
                  return (
                    <li key={campaign.id}>
                      <Link
                        href={`/campaigns/${campaign.id}`}
                        className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-medium text-slate-900">
                              {campaign.name}
                            </span>
                            <Badge tone={meta?.tone ?? "neutral"}>{meta?.label ?? campaign.status}</Badge>
                          </div>
                          <p className="mt-1 truncate text-[13px] text-slate-500">
                            {campaign.client.name} · {campaign.location} · visit{" "}
                            {formatDate(campaign.visitStart)}
                          </p>
                        </div>
                        <div className="hidden w-40 shrink-0 sm:block">
                          <p className="text-[12px] font-medium text-slate-500">
                            {total > 0 ? `${completed} of ${total} done` : "No records yet"}
                          </p>
                          <ProgressBar className="mt-1.5" value={percent} tone="brand" />
                        </div>
                        <ArrowRight className="size-4 shrink-0 text-slate-300" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {report && primaryCampaign ? (
            <Card>
              <CardHeader
                title={`Funnel · ${primaryCampaign.name}`}
                description="Live recruitment funnel for your most active campaign."
                action={
                  <ButtonLink href={`/reports?campaignId=${primaryCampaign.id}`} variant="ghost" size="sm">
                    Full report
                  </ButtonLink>
                }
              />
              <div className="space-y-5 p-5">
                <div className="grid gap-4 sm:grid-cols-4">
                  <StatTile label="Sent" value={report.metrics.sentOrLater} />
                  <StatTile
                    label="Reply rate"
                    value={formatPercent(report.metrics.replyRate)}
                    hint={`${report.metrics.repliedOrLater} replies`}
                  />
                  <StatTile
                    label="Interest rate"
                    value={formatPercent(report.metrics.interestRate)}
                    hint={`${report.metrics.interestedOrLater} interested`}
                  />
                  <StatTile
                    label="Confirmed"
                    value={report.metrics.confirmed}
                    hint={formatPercent(report.metrics.confirmationRate)}
                    accent
                  />
                </div>
                <FunnelBar counts={report.statusCounts} total={report.metrics.total} />
              </div>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Follow-ups due"
              description="Reminders only — nothing is sent automatically."
              action={
                <ButtonLink href="/follow-ups" variant="ghost" size="sm">
                  Open
                </ButtonLink>
              }
            />
            {dueFollowUps.length === 0 ? (
              <EmptyState
                icon={<Bell className="size-5" aria-hidden />}
                title="Nothing due"
                description="Follow-up reminders appear here on their scheduled day."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {dueFollowUps.map((task) => (
                  <li key={task.id} className="px-5 py-3.5">
                    <Link
                      href={`/outreach?record=${task.campaignInfluencer.id}`}
                      className="group block"
                    >
                      <p className="truncate text-[13px] font-medium text-slate-900 group-hover:text-brand-700">
                        {task.campaignInfluencer.influencer.displayName}
                      </p>
                      <p className="mt-0.5 truncate text-[12px] text-slate-500">
                        Follow-up {task.sequence} · {task.campaignInfluencer.campaign.name}
                      </p>
                      <p className="mt-1 text-[12px] font-medium text-amber-700">
                        Due {relativeTime(task.dueAt)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Recent activity" description="Actions recorded in the audit trail." />
            {recentActivity.length === 0 ? (
              <EmptyState title="No recorded activity yet" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {recentActivity.map((entry) => (
                  <li key={entry.id} className="px-5 py-3">
                    <p className="text-[13px] text-slate-800">
                      <span className="font-medium">{entry.actorEmail ?? "system"}</span>{" "}
                      <span className="text-slate-500">{entry.action}</span>
                    </p>
                    <p className="mt-0.5 text-[12px] text-slate-400">
                      {relativeTime(entry.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Callout tone="info" className="mt-7" title="Human-in-the-loop boundary">
        This tool prepares and tracks outreach. It never signs in to Facebook or Instagram, never
        types into their pages and never clicks Send. Every first-contact DM is pasted, reviewed and
        sent by you.
      </Callout>

      {dncCount > 0 ? (
        <p className="mt-4 flex items-center gap-2 text-[12px] text-slate-500">
          <ShieldAlert className="size-3.5 text-slate-400" aria-hidden />
          {dncCount} creator{dncCount === 1 ? "" : "s"} opted out and cannot be contacted without an
          administrator override.
        </p>
      ) : null}

    </Page>
  );
}
