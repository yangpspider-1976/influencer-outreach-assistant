"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { SelectMenu } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client-api";
import { formatDate } from "@/lib/format";
import {
  PIPELINE_LANES,
  STATUS_META,
  allowedTransitions,
  type OutreachStatusKey,
} from "@/lib/status";
import { cn } from "@/lib/cn";

type BoardRecord = {
  id: string;
  outreachStatus: string;
  quotedRate: string | null;
  lastContactAt: string | null;
  version: number;
  assignee: { id: string; name: string } | null;
  influencer: { id: string; displayName: string; category: string };
};

/**
 * Board columns. A leading "Sent · awaiting reply" column carries the two
 * pre-reply statuses so a creator who was messaged (but has not yet replied)
 * is visible and can be moved into the recruitment pipeline. Without it there
 * is no UI path for SENT → REPLIED — the §11 lanes only cover post-reply
 * states, so a sent creator would otherwise be invisible here.
 */
const AWAITING_COLUMN = {
  key: "AWAITING",
  label: "Sent · awaiting reply",
  accent: "border-t-brand-600",
  statuses: ["SENT", "FOLLOW_UP_DUE"] as OutreachStatusKey[],
};

const LANE_ACCENT: Record<string, string> = {
  REPLIED: "border-t-brand-400",
  INTERESTED: "border-t-indigo-400",
  NEGOTIATING: "border-t-indigo-500",
  CONFIRMED: "border-t-emerald-500",
  DECLINED: "border-t-rose-400",
  NO_RESPONSE: "border-t-slate-300",
};

type Column = { key: string; label: string; accent: string; statuses: OutreachStatusKey[] };

const COLUMNS: Column[] = [
  AWAITING_COLUMN,
  ...PIPELINE_LANES.map((lane) => ({
    key: lane,
    label: STATUS_META[lane].label,
    accent: LANE_ACCENT[lane],
    statuses: [lane] as OutreachStatusKey[],
  })),
];

/** Every status the board needs to fetch, de-duplicated. */
const BOARD_STATUSES = [...new Set(COLUMNS.flatMap((column) => column.statuses))];

/**
 * §11 Pipeline Board — the recruitment funnel from Sent through No Response.
 * Moving a card issues a validated server-side status transition (FR-021).
 * Moving a card to Replied (or any later lane) cancels its pending follow-ups.
 */
export function PipelineBoard({
  campaignId,
  canUpdate,
}: {
  campaignId: string;
  canUpdate: boolean;
}) {
  const toast = useToast();
  const [records, setRecords] = useState<BoardRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const results = await Promise.all(
          BOARD_STATUSES.map((status) =>
            api.get<{ records: BoardRecord[] }>(
              `/api/campaigns/${campaignId}/records?status=${status}&limit=100`,
            ),
          ),
        );
        if (active) setRecords(results.flatMap((result) => result.records));
      } catch (caught) {
        toast.error(
          "Could not load the pipeline",
          caught instanceof ClientApiError ? caught.message : undefined,
        );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [campaignId, reloadToken, toast]);

  async function move(record: BoardRecord, status: string) {
    try {
      await api.patch(`/api/outreach/${record.id}/status`, {
        status,
        version: record.version,
      });
      toast.success(
        "Pipeline updated",
        `${record.influencer.displayName} moved to ${STATUS_META[status as OutreachStatusKey]?.label ?? status}.`,
      );
      reload();
    } catch (caught) {
      toast.error(
        "Update rejected",
        caught instanceof ClientApiError ? caught.message : undefined,
      );
    }
  }

  if (loading) {
    return (
      <Card className="flex items-center justify-center gap-2 px-5 py-16 text-[13px] text-slate-400">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Loading pipeline…
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
      {COLUMNS.map((column) => {
        const columnRecords = records.filter((record) =>
          column.statuses.includes(record.outreachStatus as OutreachStatusKey),
        );
        return (
          <div
            key={column.key}
            className={cn(
              "rounded-xl border border-t-2 border-slate-200 bg-slate-50/50",
              column.accent,
            )}
          >
            <div className="flex items-center justify-between gap-2 px-3.5 py-3">
              <h3 className="text-[13px] font-semibold text-slate-800">{column.label}</h3>
              <span className="rounded-full bg-white px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-500 ring-1 ring-slate-200">
                {columnRecords.length}
              </span>
            </div>

            <div className="space-y-2 px-2.5 pb-3">
              {columnRecords.length === 0 ? (
                <p className="px-1 py-6 text-center text-[12px] text-slate-400">Empty</p>
              ) : (
                columnRecords.map((record) => (
                  <article
                    key={record.id}
                    className="rounded-lg border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                  >
                    <Link
                      href={`/influencers/${record.influencer.id}`}
                      className="block truncate text-[13px] font-medium text-slate-900 hover:text-brand-700"
                    >
                      {record.influencer.displayName}
                    </Link>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">
                      {record.influencer.category || "No category"}
                    </p>
                    {/* In the awaiting column, show which of the two states the card is in. */}
                    {column.key === "AWAITING" ? (
                      <p className="mt-1 text-[11px] font-medium text-slate-500">
                        {STATUS_META[record.outreachStatus as OutreachStatusKey]?.label ??
                          record.outreachStatus}
                      </p>
                    ) : null}
                    {record.quotedRate ? (
                      <p className="mt-1.5 text-[12px] font-medium text-slate-700">
                        Quoted {record.quotedRate}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-slate-400">
                      {record.assignee?.name ?? "Unassigned"} ·{" "}
                      {record.lastContactAt ? formatDate(record.lastContactAt) : "no contact"}
                    </p>

                    {canUpdate ? (
                      <SelectMenu
                        aria-label={`Move ${record.influencer.displayName}`}
                        className="mt-2.5 text-[12px]"
                        value=""
                        onChange={(next) => {
                          if (next) void move(record, next);
                        }}
                      >
                        <option value="">Move to…</option>
                        {allowedTransitions(record.outreachStatus as OutreachStatusKey).map(
                          (status) => (
                            <option key={status} value={status}>
                              {STATUS_META[status].label}
                            </option>
                          ),
                        )}
                      </SelectMenu>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
