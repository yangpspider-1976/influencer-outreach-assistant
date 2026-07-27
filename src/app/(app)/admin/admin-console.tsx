"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Badge,
  Card,
  CardHeader,
  TableShell,
  Td,
  Th,
  Tr,
} from "@/components/ui/primitives";
import { Field, Input, SelectMenu } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client-api";
import { formatDateTime } from "@/lib/format";
import {
  PERMISSIONS,
  ROLE_LABELS,
  SCOPES,
  type Permission,
  type PermissionSet,
  type RoleKeyName,
  type Scope,
} from "@/lib/rbac";

type UserRow = {
  id: string;
  name: string;
  email: string;
  status: string;
  roleKey: string;
  lastLoginAt: string | null;
};

type RoleRow = {
  id: string;
  key: string;
  name: string;
  description: string;
  permissions: PermissionSet;
};

export function AdminConsole({
  currentUserId,
  users,
  roles,
  skipReasons,
  settings,
}: {
  currentUserId: string;
  users: UserRow[];
  roles: RoleRow[];
  skipReasons: { id: string; label: string; active: boolean }[];
  settings: { key: string; value: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    roleKey: "OPERATOR" as RoleKeyName,
    password: "",
  });
  const [newSkipReason, setNewSkipReason] = useState("");

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      router.refresh();
    } catch (caught) {
      toast.error("Action failed", caught instanceof ClientApiError ? caught.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Users"
          description="Disabling an account or changing its password invalidates its live sessions immediately."
        />
        <TableShell>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th>Last sign-in</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <Tr key={user.id}>
                <Td className="font-medium text-slate-900">{user.name}</Td>
                <Td className="text-[13px]">{user.email}</Td>
                <Td>
                  <SelectMenu
                    aria-label={`Role for ${user.name}`}
                    className="w-48"
                    value={user.roleKey}
                    disabled={busy || user.id === currentUserId}
                    onChange={(nextRole) =>
                      run(
                        async () => {
                          await api.patch(`/api/users/${user.id}`, {
                            roleKey: nextRole,
                          });
                        },
                        `${user.name} is now ${ROLE_LABELS[nextRole as RoleKeyName]}`,
                      )
                    }
                  >
                    {Object.entries(ROLE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </SelectMenu>
                </Td>
                <Td className="text-[12px] text-slate-500">
                  {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "Never"}
                </Td>
                <Td>
                  <Badge tone={user.status === "ACTIVE" ? "positive" : "neutral"}>
                    {user.status.toLowerCase()}
                  </Badge>
                </Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        const password = window.prompt(
                          `Set a new password for ${user.name} (minimum 12 characters).`,
                        );
                        if (!password) return;
                        void run(async () => {
                          await api.patch(`/api/users/${user.id}`, { password });
                        }, "Password updated and sessions invalidated");
                      }}
                    >
                      Reset password
                    </Button>
                    {user.id === currentUserId ? null : (
                      <Button
                        size="sm"
                        variant={user.status === "ACTIVE" ? "danger" : "secondary"}
                        disabled={busy}
                        onClick={() =>
                          run(
                            async () => {
                              await api.patch(`/api/users/${user.id}`, {
                                status: user.status === "ACTIVE" ? "DISABLED" : "ACTIVE",
                              });
                            },
                            user.status === "ACTIVE" ? "Account disabled" : "Account enabled",
                          )
                        }
                      >
                        {user.status === "ACTIVE" ? "Disable" : "Enable"}
                      </Button>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableShell>

        <div className="grid gap-4 border-t border-slate-200 p-5 sm:grid-cols-5">
          <Field label="Full name" htmlFor="newName">
            <Input
              id="newName"
              value={newUser.name}
              onChange={(event) => setNewUser({ ...newUser, name: event.target.value })}
            />
          </Field>
          <Field label="Email" htmlFor="newEmail">
            <Input
              id="newEmail"
              type="email"
              value={newUser.email}
              onChange={(event) => setNewUser({ ...newUser, email: event.target.value })}
            />
          </Field>
          <Field label="Role" htmlFor="newRole">
            <SelectMenu
              id="newRole"
              value={newUser.roleKey}
              onChange={(value) =>
                setNewUser({ ...newUser, roleKey: value as RoleKeyName })
              }
            >
              {Object.entries(ROLE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </SelectMenu>
          </Field>
          <Field label="Initial password" htmlFor="newPassword" hint="Minimum 12 characters.">
            <Input
              id="newPassword"
              type="password"
              value={newUser.password}
              onChange={(event) => setNewUser({ ...newUser, password: event.target.value })}
            />
          </Field>
          <div className="flex items-end">
            <Button
              className="w-full"
              disabled={busy || newUser.password.length < 12 || !newUser.email}
              icon={busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : undefined}
              onClick={() =>
                run(async () => {
                  await api.post("/api/users", newUser);
                  setNewUser({ name: "", email: "", roleKey: "OPERATOR", password: "" });
                }, "Account created")
              }
            >
              Add user
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Role permissions"
          description="Server-side authorization reads these values directly. Scopes: none < own < assigned < campaign < all."
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-2.5">Permission</th>
                {roles.map((role) => (
                  <th key={role.id} className="px-4 py-2.5">
                    {role.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((permission) => (
                <tr key={permission} className="border-b border-slate-100">
                  <td className="px-4 py-2.5 font-medium text-slate-700">
                    {permission.replace(/_/g, " ")}
                  </td>
                  {roles.map((role) => (
                    <td key={role.id} className="px-4 py-2">
                      <SelectMenu
                        aria-label={`${permission} for ${role.name}`}
                        className="w-32 text-[12px]"
                        value={role.permissions[permission as Permission]}
                        disabled={busy || role.key === "ADMIN"}
                        onChange={(scopeValue) =>
                          run(async () => {
                            await api.patch("/api/admin/roles", {
                              roleId: role.id,
                              permission,
                              scope: scopeValue as Scope,
                            });
                          }, "Permission updated")
                        }
                      >
                        {SCOPES.map((scope) => (
                          <option key={scope} value={scope}>
                            {scope}
                          </option>
                        ))}
                      </SelectMenu>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Skip reasons"
            description="Operators must choose from this controlled list when skipping a record."
          />
          <ul className="divide-y divide-slate-100">
            {skipReasons.map((reason) => (
              <li key={reason.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="text-[13px] text-slate-700">{reason.label}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await api.patch("/api/admin/skip-reasons", {
                        id: reason.id,
                        active: !reason.active,
                      });
                    }, reason.active ? "Reason deactivated" : "Reason activated")
                  }
                >
                  {reason.active ? "Deactivate" : "Activate"}
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2 border-t border-slate-200 p-5">
            <Input
              aria-label="New skip reason"
              placeholder="Add a skip reason"
              value={newSkipReason}
              onChange={(event) => setNewSkipReason(event.target.value)}
            />
            <Button
              disabled={busy || newSkipReason.trim().length < 3}
              onClick={() =>
                run(async () => {
                  await api.post("/api/admin/skip-reasons", { label: newSkipReason.trim() });
                  setNewSkipReason("");
                }, "Skip reason added")
              }
            >
              Add
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Organization settings"
            description="Retention windows and the operator disclaimer shown in the workspace."
          />
          <ul className="divide-y divide-slate-100">
            {settings.map((setting) => (
              <li key={setting.key} className="px-5 py-3">
                <p className="font-mono text-[11px] text-slate-400">{setting.key}</p>
                <div className="mt-1.5 flex gap-2">
                  <Input
                    aria-label={setting.key}
                    defaultValue={setting.value.replace(/^"|"$/g, "")}
                    onBlur={(event) => {
                      const raw = event.target.value;
                      const value = /^\d+$/.test(raw) ? Number(raw) : raw;
                      if (String(value) === setting.value.replace(/^"|"$/g, "")) return;
                      void run(async () => {
                        await api.patch("/api/admin/settings", { key: setting.key, value });
                      }, "Setting saved");
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
