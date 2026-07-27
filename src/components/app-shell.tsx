"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bell,
  ClipboardList,
  FileText,
  KanbanSquare,
  LayoutDashboard,
  LogOut,
  Menu,
  Send,
  Search,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { api } from "@/lib/client-api";
import { initialsOf } from "@/lib/format";
import {
  canUseCreatorDiscovery,
  has,
  type Permission,
  type PermissionSet,
} from "@/lib/rbac";
import { BrandLockup } from "@/components/brand";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission?: Permission;
  visibleWhen?: (permissions: PermissionSet) => boolean;
  badge?: "queue" | "followUps";
};

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Work",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      {
        href: "/outreach",
        label: "Outreach workspace",
        icon: Send,
        permission: "outreach_process",
        badge: "queue",
      },
      {
        href: "/follow-ups",
        label: "Follow-up queue",
        icon: Bell,
        permission: "outreach_process",
        badge: "followUps",
      },
      { href: "/pipeline", label: "Pipeline board", icon: KanbanSquare, permission: "campaigns_view" },
    ],
  },
  {
    title: "Manage",
    items: [
      { href: "/campaigns", label: "Campaigns", icon: ClipboardList, permission: "campaigns_view" },
      {
        href: "/discovery",
        label: "Creator discovery",
        icon: Search,
        visibleWhen: canUseCreatorDiscovery,
      },
      { href: "/influencers", label: "Influencer database", icon: Users, permission: "influencers_view" },
      { href: "/templates", label: "Message templates", icon: FileText, permission: "campaigns_view" },
      { href: "/reports", label: "Reports", icon: BarChart3, permission: "reports_view" },
    ],
  },
  {
    title: "Governance",
    items: [
      { href: "/audit", label: "Audit log", icon: ShieldCheck, permission: "audit_view" },
      { href: "/admin", label: "Administration", icon: Settings, permission: "manage_users" },
    ],
  },
];

export function AppShell({
  user,
  permissions,
  badges,
  children,
}: {
  user: { name: string; email: string; roleKey: string; roleName: string };
  permissions: PermissionSet;
  badges: { queue: number; followUps: number };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await api.post("/api/auth/logout").catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        (!item.permission || has(permissions, item.permission)) &&
        (!item.visibleWhen || item.visibleWhen(permissions)),
    ),
  })).filter((group) => group.items.length > 0);

  const nav = (
    <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
      {groups.map((group) => (
        <div key={group.title}>
          <p className="px-2.5 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            {group.title}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              const count = item.badge ? badges[item.badge] : 0;
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
                      active
                        ? "bg-brand-50 text-brand-700"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-4 shrink-0",
                        active ? "text-brand-600" : "text-slate-400 group-hover:text-slate-500",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {count > 0 ? (
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                          active ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-700",
                        )}
                      >
                        {count > 99 ? "99+" : count}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const account = (
    <div className="border-t border-slate-200 p-3">
      <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
          {initialsOf(user.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium leading-4 text-slate-900">
            {user.name}
          </span>
          <span className="block truncate text-[11px] leading-4 text-slate-500">
            {user.roleName}
          </span>
        </span>
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          title="Sign out"
          aria-label="Sign out"
          className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
        >
          <LogOut className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-white">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-14 items-center border-b border-slate-200 px-4">
          <Link href="/dashboard" className="min-w-0">
            <BrandLockup />
          </Link>
        </div>
        {nav}
        {account}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-900/25"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative flex h-full w-64 flex-col border-r border-slate-200 bg-white">
            <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
              <BrandLockup />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"
                aria-label="Close navigation"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            {nav}
            {account}
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Open navigation"
          >
            <Menu className="size-5" aria-hidden />
          </button>
          <BrandLockup compact />
          <span className="text-[13px] font-semibold text-slate-900">QROAD Outreach</span>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
