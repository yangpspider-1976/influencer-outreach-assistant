import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, ShieldAlert } from "lucide-react";
import { requirePageUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { has } from "@/lib/rbac";
import { formatDate, formatDateTime } from "@/lib/format";
import { SOCIAL_PLATFORM_LABELS } from "@/lib/social-url";
import { Page } from "@/components/ui/page";
import {
  Badge,
  Callout,
  Card,
  CardHeader,
  PageHeader,
  StatusBadge,
} from "@/components/ui/primitives";
import { DncControl } from "./dnc-control";
import { ProfilePanel } from "./profile-panel";
import { AddToCampaign } from "./add-to-campaign";

export const metadata: Metadata = { title: "Influencer" };
export const dynamic = "force-dynamic";

export default async function InfluencerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePageUser();
  if (!has(user.permissions, "influencers_view")) redirect("/dashboard");
  const { id } = await params;

  const influencer = await prisma.influencer.findUnique({
    where: { id },
    include: {
      profiles: true,
      tags: { include: { tag: true } },
      dncSetBy: { select: { name: true } },
      records: {
        orderBy: { updatedAt: "desc" },
        include: {
          campaign: { select: { id: true, name: true, client: { select: { name: true } } } },
          assignee: { select: { name: true } },
          attempts: { orderBy: { createdAt: "desc" }, take: 3, include: { createdBy: { select: { name: true } } } },
        },
      },
    },
  });
  if (!influencer) notFound();

  const canAddToCampaign = has(user.permissions, "influencers_import");
  const openCampaigns = canAddToCampaign
    ? await prisma.campaign.findMany({
        where: { status: { in: ["DRAFT", "ACTIVE", "PAUSED"] } },
        select: { id: true, name: true, status: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      })
    : [];
  const existingCampaignIds = [...new Set(influencer.records.map((record) => record.campaign.id))];

  return (
    <Page>
      <PageHeader
        breadcrumb={
          <Link
            href="/influencers"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-500 transition-colors hover:text-slate-800"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Influencer database
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {influencer.displayName}
            {influencer.dncFlag ? (
              <Badge tone="danger">
                <ShieldAlert className="size-3" aria-hidden />
                Do not contact
              </Badge>
            ) : null}
          </span>
        }
        description={
          [influencer.category, influencer.location].filter(Boolean).join(" · ") ||
          "No category or location recorded"
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canAddToCampaign ? (
              <AddToCampaign
                influencerId={influencer.id}
                campaigns={openCampaigns}
                existingCampaignIds={existingCampaignIds}
              />
            ) : null}
            {has(user.permissions, "influencers_dnc") ? (
              <DncControl
                influencerId={influencer.id}
                displayName={influencer.displayName}
                dncFlag={influencer.dncFlag}
                canClear={user.permissions.dnc_override === "all"}
              />
            ) : null}
          </div>
        }
      />

      {influencer.dncFlag ? (
        <Callout tone="danger" className="mt-6" title="This creator opted out">
          {influencer.dncReason || "No reason recorded."}
          {influencer.dncSetBy
            ? ` Set by ${influencer.dncSetBy.name} on ${formatDate(influencer.dncSetAt)}.`
            : ""}{" "}
          They are blocked from every outreach queue until an administrator records an audited
          override.
        </Callout>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Campaign history" description="Every campaign this creator has been part of." />
            {influencer.records.length === 0 ? (
              <p className="px-5 py-12 text-center text-[13px] text-slate-400">
                Not part of any campaign yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {influencer.records.map((record) => (
                  <li key={record.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/campaigns/${record.campaign.id}`}
                          className="text-[13px] font-medium text-slate-900 hover:text-brand-700"
                        >
                          {record.campaign.name}
                        </Link>
                        <p className="mt-0.5 text-[12px] text-slate-500">
                          {record.campaign.client.name}
                          {record.assignee ? ` · ${record.assignee.name}` : ""}
                          {record.lastContactAt
                            ? ` · last contact ${formatDate(record.lastContactAt)}`
                            : ""}
                        </p>
                      </div>
                      <StatusBadge status={record.outreachStatus} />
                    </div>

                    {record.attempts.length > 0 ? (
                      <ul className="mt-2.5 space-y-1 border-l-2 border-slate-100 pl-3">
                        {record.attempts.map((attempt) => (
                          <li key={attempt.id} className="text-[12px] text-slate-500">
                            <span className="font-medium text-slate-700">
                              {attempt.outcome.replace(/_/g, " ").toLowerCase()}
                            </span>{" "}
                            · {attempt.createdBy.name} · {formatDateTime(attempt.createdAt)}
                            {attempt.note ? ` · ${attempt.note}` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <ProfilePanel
            influencerId={influencer.id}
            canEdit={has(user.permissions, "influencers_write")}
            tags={influencer.tags.map((link) => ({ tagId: link.tagId, name: link.tag.name }))}
            values={{
              displayName: influencer.displayName,
              firstName: influencer.firstName ?? "",
              category: influencer.category,
              location: influencer.location,
              followerCountRaw: influencer.followerCountRaw ?? "",
              followerCountNumeric: influencer.followerCountNumeric,
              email: influencer.email ?? "",
              phone: influencer.phone ?? "",
              rate: influencer.rate ?? "",
              notes: influencer.notes,
            }}
          />

          <Card>
            <CardHeader title="Social profiles" description="Saved links used to launch the profile." />
            <ul className="divide-y divide-slate-100">
              {influencer.profiles.length === 0 ? (
                <li className="px-5 py-6 text-center text-[13px] text-slate-400">
                  No profile links saved.
                </li>
              ) : (
                influencer.profiles.map((profile) => (
                  <li key={profile.id} className="px-5 py-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[13px] font-medium text-slate-800">
                        {SOCIAL_PLATFORM_LABELS[profile.platform]}
                        {profile.preferredFlag ? (
                          <span className="ml-2 text-[11px] font-normal text-brand-600">
                            preferred
                          </span>
                        ) : null}
                      </span>
                      <a
                        href={profile.originalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-600 hover:text-brand-700"
                      >
                        Open
                        <ExternalLink className="size-3" aria-hidden />
                      </a>
                    </div>
                    <p className="mt-1 truncate font-mono text-[11px] text-slate-400">
                      {profile.normalizedUrl}
                    </p>
                  </li>
                ))
              )}
            </ul>
          </Card>
        </div>
      </div>
    </Page>
  );
}
