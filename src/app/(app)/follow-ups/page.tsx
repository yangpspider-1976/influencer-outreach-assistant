import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/auth";
import { has } from "@/lib/rbac";
import { Page } from "@/components/ui/page";
import { PageHeader, Callout } from "@/components/ui/primitives";
import { FollowUpQueue } from "./follow-up-queue";

export const metadata: Metadata = { title: "Follow-up queue" };
export const dynamic = "force-dynamic";

export default async function FollowUpsPage() {
  const user = await requirePageUser();
  if (!has(user.permissions, "outreach_process")) redirect("/dashboard");

  return (
    <Page>
      <PageHeader
        title="Follow-up queue"
        description="Reminders the system scheduled after a message was recorded as sent. Follow-up messages are still sent manually by you."
      />
      <Callout tone="info" className="mt-5">
        Completing a follow-up records that you sent it yourself. A reply, decline or do-not-contact
        decision cancels every remaining reminder automatically.
      </Callout>
      <div className="mt-6">
        <FollowUpQueue />
      </div>
    </Page>
  );
}
