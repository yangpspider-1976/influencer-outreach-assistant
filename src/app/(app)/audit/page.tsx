import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { has, hasScope } from "@/lib/rbac";
import { formatDateTime } from "@/lib/format";
import { Page } from "@/components/ui/page";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  TableShell,
  Td,
  Th,
  Tr,
} from "@/components/ui/primitives";
import { AuditFilters } from "./audit-filters";
import type { Prisma } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; entity?: string; page?: string }>;
}) {
  const user = await requirePageUser();
  if (!has(user.permissions, "audit_view")) redirect("/dashboard");

  const params = await searchParams;
  const page = Math.max(Number(params.page ?? 1), 1);

  let scopeFilter: Prisma.AuditLogWhereInput = {};
  if (!hasScope(user.permissions, "audit_view", "all")) {
    if (hasScope(user.permissions, "audit_view", "campaign")) {
      const owned = await prisma.campaign.findMany({
        where: { ownerId: user.id },
        select: { id: true },
      });
      scopeFilter = {
        OR: [{ actorId: user.id }, { campaignId: { in: owned.map((row) => row.id) } }],
      };
    } else {
      scopeFilter = { actorId: user.id };
    }
  }

  const where: Prisma.AuditLogWhereInput = {
    ...scopeFilter,
    ...(params.entity ? { entity: params.entity } : {}),
    ...(params.search
      ? {
          OR: [
            { actorEmail: { contains: params.search, mode: "insensitive" } },
            { action: { contains: params.search, mode: "insensitive" } },
            { entityId: { contains: params.search } },
          ],
        }
      : {}),
  };

  const [logs, total, entities] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      distinct: ["entity"],
      select: { entity: true },
      orderBy: { entity: "asc" },
      take: 40,
    }),
  ]);

  return (
    <Page>
      <PageHeader
        title="Audit log"
        description="Actor, action, record, previous and new values, session identifier and timestamp for every material change."
      />

      <Card className="mt-7">
        <AuditFilters entities={entities.map((row) => row.entity)} />

        {logs.length === 0 ? (
          <EmptyState
            title="No audit entries match these filters"
            description="Status changes, do-not-contact decisions, assignments, exports and permission changes all land here."
          />
        ) : (
          <>
            <TableShell>
              <thead>
                <tr>
                  <Th className="w-44">When</Th>
                  <Th className="w-56">Actor</Th>
                  <Th className="w-56">Action</Th>
                  <Th>Record</Th>
                  <Th>Change</Th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <Tr key={log.id} className="align-top">
                    <Td className="whitespace-nowrap text-[12px] text-slate-500">
                      {formatDateTime(log.createdAt)}
                    </Td>
                    <Td className="text-[13px]">
                      {log.actorEmail ?? <span className="text-slate-400">system</span>}
                      {log.ipAddress ? (
                        <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                          {log.ipAddress}
                        </p>
                      ) : null}
                    </Td>
                    <Td>
                      <Badge tone={toneFor(log.action)}>{log.action}</Badge>
                    </Td>
                    <Td className="text-[12px]">
                      <span className="text-slate-600">{log.entity}</span>
                      {log.entityId ? (
                        <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                          {log.entityId}
                        </p>
                      ) : null}
                    </Td>
                    <Td className="text-[12px]">
                      {log.oldValues || log.newValues ? (
                        <div className="space-y-1">
                          {log.oldValues ? (
                            <p className="font-mono text-[11px] text-rose-600">
                              − {JSON.stringify(log.oldValues)}
                            </p>
                          ) : null}
                          {log.newValues ? (
                            <p className="font-mono text-[11px] text-emerald-700">
                              + {JSON.stringify(log.newValues)}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableShell>

            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-[12px] text-slate-500">
              <span>
                {(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + logs.length} of {total}
              </span>
              <span className="flex gap-3">
                {page > 1 ? (
                  <a
                    href={`?${new URLSearchParams({ ...params, page: String(page - 1) })}`}
                    className="font-medium text-brand-600 hover:text-brand-700"
                  >
                    Previous
                  </a>
                ) : null}
                {(page - 1) * PAGE_SIZE + logs.length < total ? (
                  <a
                    href={`?${new URLSearchParams({ ...params, page: String(page + 1) })}`}
                    className="font-medium text-brand-600 hover:text-brand-700"
                  >
                    Next
                  </a>
                ) : null}
              </span>
            </div>
          </>
        )}
      </Card>
    </Page>
  );
}

function toneFor(action: string) {
  if (action.includes("dnc") || action.includes("disable") || action.includes("failure")) {
    return "danger" as const;
  }
  if (action.includes("export") || action.includes("permission") || action.includes("role")) {
    return "warning" as const;
  }
  if (action.includes("outcome") || action.includes("status")) return "progress" as const;
  return "neutral" as const;
}
