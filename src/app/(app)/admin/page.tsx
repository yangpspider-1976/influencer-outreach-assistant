import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { has, parsePermissionSet } from "@/lib/rbac";
import { Page } from "@/components/ui/page";
import { Callout, PageHeader } from "@/components/ui/primitives";
import { AdminConsole } from "./admin-console";
import { ResetDemoData } from "./reset-demo-data";

export const metadata: Metadata = { title: "Administration" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requirePageUser();
  if (!has(user.permissions, "manage_users")) redirect("/dashboard");

  const [users, roles, skipReasons, settings] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ status: "asc" }, { name: "asc" }],
      include: { role: { select: { key: true, name: true } } },
    }),
    prisma.role.findMany({ orderBy: { key: "asc" } }),
    prisma.skipReason.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.appSetting.findMany({ orderBy: { key: "asc" } }),
  ]);

  return (
    <Page>
      <PageHeader
        title="Administration"
        description="Users, roles, controlled lists and retention settings. Every change here is written to the audit log."
      />

      <Callout tone="warning" className="mt-5" title="Platform safety boundary">
        This application must never store Facebook or Instagram passwords, cookies or session data,
        and must never automate actions inside those platforms. Re-check Meta&apos;s current
        requirements before each production release.
      </Callout>

      <div className="mt-6">
        <AdminConsole
          currentUserId={user.id}
          users={users.map((row) => ({
            id: row.id,
            name: row.name,
            email: row.email,
            status: row.status,
            roleKey: row.role.key,
            lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
          }))}
          roles={roles.map((role) => ({
            id: role.id,
            key: role.key,
            name: role.name,
            description: role.description,
            permissions: parsePermissionSet(role.permissionSet),
          }))}
          skipReasons={skipReasons.map((reason) => ({
            id: reason.id,
            label: reason.label,
            active: reason.active,
          }))}
          settings={settings.map((setting) => ({
            key: setting.key,
            value: String(setting.value),
          }))}
        />
      </div>

      {/* Mirrors the server-side guard in the reset endpoint. */}
      <div className="mt-6">
        <ResetDemoData
          allowedHere={
            process.env.NODE_ENV !== "production" || process.env.ALLOW_DEMO_RESET === "true"
          }
        />
      </div>
    </Page>
  );
}
