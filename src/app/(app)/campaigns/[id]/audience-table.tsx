"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw, ShieldAlert, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, SelectMenu } from "@/components/ui/form";
import {
  Badge,
  Card,
  EmptyState,
  StatusBadge,
  TableShell,
  Td,
  Th,
  Tr,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client-api";
import { formatCompactNumber } from "@/lib/format";
import type { RoleKeyName } from "@/lib/rbac";
import { SOCIAL_PLATFORM_LABELS, type SocialPlatform } from "@/lib/social-url";
import { OUTREACH_STATUSES, STATUS_META } from "@/lib/status";
import { AddCreatorControl } from "./add-creator-control";

type AudienceRecord = {
  id: string;
  outreachStatus: string;
  priority: number;
  assignee: { id: string; name: string } | null;
  influencer: {
    id: string;
    displayName: string;
    category: string;
    location: string;
    followerCountRaw: string | null;
    followerCountNumeric: number | null;
    dncFlag: boolean;
    profiles: { platform: SocialPlatform; originalUrl: string; preferredFlag: boolean }[];
  };
};

type AssignableUser = { id: string; name: string; roleKey: RoleKeyName };

const ASSIGNABLE_ROLE_LABELS: Record<RoleKeyName, string> = {
  ADMIN: "Admin",
  CAMPAIGN_MANAGER: "Campaign Manager",
  OPERATOR: "Operator",
  VIEWER: "Viewer",
};

function assignableUserLabel(user: AssignableUser): string {
  return `${user.name} - ${ASSIGNABLE_ROLE_LABELS[user.roleKey]}`;
}

export function AudienceTable({
  campaignId,
  operators,
  canAssign,
  canOverrideDnc,
  canAdd,
}: {
  campaignId: string;
  operators: AssignableUser[];
  canAssign: boolean;
  canOverrideDnc: boolean;
  canAdd: boolean;
}) {
  const toast = useToast();
  const [records, setRecords] = useState<AudienceRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignee, setAssignee] = useState(operators[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState({ status: "", assigneeId: "", search: "" });

  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => {
    setLoading(true);
    setReloadToken((token) => token + 1);
  }, []);

  // Every state update happens after the await, so the effect never triggers a
  // synchronous cascading render.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const query = new URLSearchParams();
        if (filters.status) query.set("status", filters.status);
        if (filters.assigneeId) query.set("assigneeId", filters.assigneeId);
        if (filters.search) query.set("search", filters.search);
        const result = await api.get<{ records: AudienceRecord[]; total: number }>(
          `/api/campaigns/${campaignId}/records?${query.toString()}`,
        );
        if (!active) return;
        setRecords(result.records);
        setTotal(result.total);
        setSelected(new Set());
      } catch (caught) {
        toast.error(
          "Could not load the audience",
          caught instanceof ClientApiError ? caught.message : undefined,
        );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [campaignId, filters, reloadToken, toast]);

  const allSelected = useMemo(
    () => records.length > 0 && records.every((record) => selected.has(record.id)),
    [records, selected],
  );

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function assign(targetId: string | null) {
    setBusy(true);
    try {
      const result = await api.post<{
        assigned: number;
        markedReady: number;
        blockedByDnc: string[];
      }>(`/api/campaigns/${campaignId}/assign`, {
        recordIds: [...selected],
        assigneeId: targetId,
        markReady: Boolean(targetId),
      });
      toast.success(
        targetId
          ? `${result.assigned} record${result.assigned === 1 ? "" : "s"} assigned`
          : `${result.assigned} record${result.assigned === 1 ? "" : "s"} unassigned`,
        result.blockedByDnc.length
          ? `${result.blockedByDnc.length} do-not-contact record(s) were skipped.`
          : `${result.markedReady} marked Ready to Send.`,
      );
      reload();
    } catch (caught) {
      toast.error(
        "Assignment failed",
        caught instanceof ClientApiError ? caught.message : undefined,
      );
    } finally {
      setBusy(false);
    }
  }

  async function overrideDnc(recordId: string, name: string) {
    const reason = window.prompt(
      `Release "${name}" from do-not-contact for this campaign?\n\nA written reason is required and will be recorded in the audit log.`,
    );
    if (!reason) return;
    try {
      await api.post(`/api/outreach/${recordId}/dnc-override`, { reason });
      toast.success("Override recorded", "The record is now Ready to Send and fully audited.");
      reload();
    } catch (caught) {
      toast.error(
        "Override rejected",
        caught instanceof ClientApiError ? caught.message : undefined,
      );
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-3.5">
        <Input
          placeholder="Search creator, category or location"
          aria-label="Search audience"
          className="min-w-52 flex-1"
          defaultValue={filters.search}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            // Read the value now — the updater below runs during render, by which
            // point React has cleared event.currentTarget (it would be null).
            const nextSearch = event.currentTarget.value.trim();
            setLoading(true);
            setFilters((current) => ({ ...current, search: nextSearch }));
          }}
        />
        <SelectMenu
          aria-label="Filter by status"
          className="w-44"
          value={filters.status}
          onChange={(next) => {
            setLoading(true);
            setFilters((current) => ({ ...current, status: next }));
          }}
        >
          <option value="">All statuses</option>
          {OUTREACH_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_META[status].label}
            </option>
          ))}
        </SelectMenu>
        <SelectMenu
          aria-label="Filter by operator"
          className="w-44"
          value={filters.assigneeId}
          onChange={(next) => {
            setLoading(true);
            setFilters((current) => ({ ...current, assigneeId: next }));
          }}
        >
          <option value="">All operators</option>
          <option value="unassigned">Unassigned</option>
          {operators.map((operator) => (
            <option key={operator.id} value={operator.id}>
              {assignableUserLabel(operator)}
            </option>
          ))}
        </SelectMenu>
        {canAdd ? <AddCreatorControl campaignId={campaignId} onAdded={reload} /> : null}
        <Button variant="ghost" size="sm" onClick={reload} aria-label="Refresh">
          <RefreshCw className="size-4" aria-hidden />
        </Button>
      </div>

      {canAssign && selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-brand-200 bg-brand-50 px-5 py-3">
          <span className="text-[13px] font-medium text-brand-900">
            {selected.size} selected
          </span>
          <SelectMenu
            aria-label="Assign to operator"
            className="w-52"
            value={assignee}
            onChange={(value) => setAssignee(value)}
          >
            {operators.map((operator) => (
              <option key={operator.id} value={operator.id}>
                {assignableUserLabel(operator)}
              </option>
            ))}
          </SelectMenu>
          <Button size="sm" onClick={() => assign(assignee)} disabled={busy || !assignee}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Assign &amp; mark ready
          </Button>
          <Button size="sm" variant="secondary" onClick={() => assign(null)} disabled={busy}>
            Unassign
          </Button>
          <span className="text-[12px] text-brand-800/80">
            Bulk send is intentionally not available.
          </span>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center gap-2 px-5 py-16 text-[13px] text-slate-400">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading audience…
        </div>
      ) : records.length === 0 ? (
        <EmptyState
          icon={<Users className="size-5" aria-hidden />}
          title="No records match these filters"
          description="Import an influencer list to build this campaign's audience."
        />
      ) : (
        <>
          <TableShell>
            <thead>
              <tr>
                {canAssign ? (
                  <Th className="w-10">
                    <input
                      type="checkbox"
                      aria-label="Select all rows"
                      className="size-4 rounded border-slate-300 text-brand-600"
                      checked={allSelected}
                      onChange={(event) =>
                        setSelected(
                          event.target.checked ? new Set(records.map((r) => r.id)) : new Set(),
                        )
                      }
                    />
                  </Th>
                ) : null}
                <Th>Creator</Th>
                <Th>Channels</Th>
                <Th>Category</Th>
                <Th className="text-right">Followers</Th>
                <Th>Status</Th>
                <Th>Operator</Th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <Tr key={record.id}>
                  {canAssign ? (
                    <Td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${record.influencer.displayName}`}
                        className="size-4 rounded border-slate-300 text-brand-600"
                        checked={selected.has(record.id)}
                        onChange={() => toggle(record.id)}
                      />
                    </Td>
                  ) : null}
                  <Td>
                    <Link
                      href={`/influencers/${record.influencer.id}`}
                      className="font-medium text-slate-900 hover:text-brand-700"
                    >
                      {record.influencer.displayName}
                    </Link>
                    {record.influencer.dncFlag ? (
                      <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-medium text-rose-600">
                        <ShieldAlert className="size-3" aria-hidden />
                        Do not contact
                      </span>
                    ) : null}
                    <p className="mt-0.5 text-[12px] text-slate-500">
                      {record.influencer.location || "—"}
                    </p>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {record.influencer.profiles.length === 0 ? (
                        <span className="text-[12px] text-slate-400">No profile</span>
                      ) : (
                        record.influencer.profiles.map((profile) => (
                          <Badge key={profile.platform} tone="info">
                            {SOCIAL_PLATFORM_LABELS[profile.platform]}
                          </Badge>
                        ))
                      )}
                    </div>
                  </Td>
                  <Td className="text-[13px]">{record.influencer.category || "—"}</Td>
                  <Td className="text-right tabular-nums">
                    {record.influencer.followerCountNumeric
                      ? formatCompactNumber(record.influencer.followerCountNumeric)
                      : record.influencer.followerCountRaw || "—"}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={record.outreachStatus} />
                      {canOverrideDnc && record.influencer.dncFlag ? (
                        <button
                          type="button"
                          onClick={() => overrideDnc(record.id, record.influencer.displayName)}
                          className="text-[11px] font-medium text-brand-600 underline-offset-2 hover:underline"
                        >
                          Override
                        </button>
                      ) : null}
                    </div>
                  </Td>
                  <Td className="text-[13px]">{record.assignee?.name ?? "—"}</Td>
                </Tr>
              ))}
            </tbody>
          </TableShell>
          <p className="border-t border-slate-100 px-5 py-3 text-[12px] text-slate-500">
            Showing {records.length} of {total} records.
          </p>
        </>
      )}
    </Card>
  );
}
