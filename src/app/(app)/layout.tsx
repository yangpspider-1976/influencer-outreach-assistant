import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ToastProvider } from "@/components/ui/toast";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Badge counts for the sidebar — kept to two cheap aggregates.
  const seesAllQueues = user.permissions.outreach_process === "all";
  const [queueCount, followUpCount] = await Promise.all([
    prisma.campaignInfluencer.count({
      where: {
        campaign: { status: "ACTIVE" },
        outreachStatus: { in: ["READY", "FOLLOW_UP_DUE"] },
        assigneeId: user.id,
        OR: [{ influencer: { dncFlag: false } }, { dncOverrideById: { not: null } }],
      },
    }),
    prisma.followUpTask.count({
      where: {
        status: "PENDING",
        dueAt: { lte: new Date() },
        ...(seesAllQueues ? {} : { assignedToId: user.id }),
      },
    }),
  ]);

  return (
    <ToastProvider>
      <AppShell
        user={{
          name: user.name,
          email: user.email,
          roleKey: user.roleKey,
          roleName: user.roleName,
        }}
        permissions={user.permissions}
        badges={{ queue: queueCount, followUps: followUpCount }}
      >
        {children}
      </AppShell>
    </ToastProvider>
  );
}
