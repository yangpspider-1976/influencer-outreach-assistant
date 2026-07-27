import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Inbox } from "lucide-react";
import { requirePageUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { has } from "@/lib/rbac";
import {
  acquireLock,
  loadNextQueueRecord,
  loadWorkspaceRecord,
  queueOrderBy,
  queueWhere,
} from "@/lib/outreach-service";
import { buildWorkspacePayload } from "@/lib/workspace-payload";
import { Page } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { OutreachWorkspace } from "./outreach-workspace";

export const metadata: Metadata = { title: "Outreach workspace" };
export const dynamic = "force-dynamic";

export default async function OutreachPage({
  searchParams,
}: {
  searchParams: Promise<{ record?: string; campaignId?: string }>;
}) {
  const user = await requirePageUser();
  if (!has(user.permissions, "outreach_process")) redirect("/dashboard");

  const { record: recordId, campaignId } = await searchParams;

  const target = recordId
    ? await loadWorkspaceRecord(user, recordId)
    : await loadNextQueueRecord(user, campaignId ?? null);

  if (!target) {
    const assignedTotal = await prisma.campaignInfluencer.count({
      where: { assigneeId: user.id },
    });
    return (
      <Page>
        <PageHeader
          title="Outreach workspace"
          description="One creator at a time: review, copy, open the profile, send it yourself, then record the result."
        />
        <Card className="mt-7">
          <EmptyState
            icon={<Inbox className="size-5" aria-hidden />}
            title="Your queue is empty"
            description={
              assignedTotal > 0
                ? "Every record assigned to you has been processed. A campaign manager can assign more."
                : "No records are assigned to you yet. Ask a campaign manager to assign work from a campaign's audience tab."
            }
            action={<ButtonLink href="/dashboard" variant="secondary">Back to dashboard</ButtonLink>}
          />
        </Card>
      </Page>
    );
  }

  // Take the short processing lock so a second operator cannot open the same
  // record while this one is being worked (§10 Concurrency).
  await acquireLock(target.id, user.id);
  const fresh = await loadWorkspaceRecord(user, target.id);
  const payload = await buildWorkspacePayload(fresh);

  const [remaining, upcoming] = await Promise.all([
    prisma.campaignInfluencer.count({ where: queueWhere(user.id, campaignId ?? null) }),
    prisma.campaignInfluencer.findMany({
      where: { ...queueWhere(user.id, campaignId ?? null), id: { not: target.id } },
      orderBy: queueOrderBy,
      take: 6,
      select: {
        id: true,
        outreachStatus: true,
        dueAt: true,
        influencer: { select: { displayName: true, category: true } },
      },
    }),
  ]);

  return (
    <OutreachWorkspace
      payload={payload}
      remaining={remaining}
      upcoming={upcoming.map((entry) => ({
        id: entry.id,
        displayName: entry.influencer.displayName,
        category: entry.influencer.category,
        outreachStatus: entry.outreachStatus,
        dueAt: entry.dueAt ? entry.dueAt.toISOString() : null,
      }))}
      canEditSentRecord={has(user.permissions, "outreach_edit_sent")}
    />
  );
}
