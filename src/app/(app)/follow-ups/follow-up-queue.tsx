"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BellOff, ClipboardCopy, Check, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, StatusBadge, Badge } from "@/components/ui/primitives";
import { SelectMenu } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError, copyPlainText, openProfile } from "@/lib/client-api";
import { formatDate, relativeTime } from "@/lib/format";

type Task = {
  id: string;
  sequence: number;
  dueAt: string;
  overdue: boolean;
  assignedTo: { id: string; name: string } | null;
  previousMessage: string | null;
  previousSentAt: string | null;
  channel: string | null;
  record: {
    id: string;
    outreachStatus: string;
    campaign: { id: string; name: string; client: string };
    influencer: {
      id: string;
      displayName: string;
      dncFlag: boolean;
      profiles: { platform: string; originalUrl: string; preferredFlag: boolean }[];
    };
  };
};

export function FollowUpQueue() {
  const toast = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<"due" | "all">("due");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  // Every state update happens after the await, so the effect never triggers a
  // synchronous cascading render.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await api.get<{ tasks: Task[] }>(`/api/follow-ups?scope=${scope}`);
        if (active) setTasks(result.tasks);
      } catch (caught) {
        toast.error(
          "Could not load follow-ups",
          caught instanceof ClientApiError ? caught.message : undefined,
        );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [scope, reloadToken, toast]);

  async function update(task: Task, status: "COMPLETED" | "CANCELLED") {
    setBusyId(task.id);
    try {
      await api.patch(`/api/follow-ups/${task.id}`, { status });
      toast.success(
        status === "COMPLETED" ? "Follow-up completed" : "Follow-up cancelled",
        status === "COMPLETED"
          ? "Recorded that you sent the follow-up yourself."
          : undefined,
      );
      reload();
    } catch (caught) {
      toast.error(
        "Update failed",
        caught instanceof ClientApiError ? caught.message : undefined,
      );
    } finally {
      setBusyId(null);
    }
  }

  async function copyPrevious(task: Task) {
    if (!task.previousMessage) return;
    const ok = await copyPlainText(task.previousMessage);
    toast[ok ? "success" : "error"](
      ok ? "Previous message copied" : "Clipboard unavailable",
      ok ? "Adapt it before sending the follow-up." : "Copy the text manually from the panel.",
    );
  }

  return (
    <Card>
      <CardHeader
        title={scope === "due" ? "Due and overdue" : "All pending reminders"}
        description={`${tasks.length} task${tasks.length === 1 ? "" : "s"}`}
        action={
          <SelectMenu
            aria-label="Scope"
            className="w-40"
            value={scope}
            onChange={(value) => {
              setLoading(true);
              setScope(value as "due" | "all");
            }}
          >
            <option value="due">Due now</option>
            <option value="all">All pending</option>
          </SelectMenu>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center gap-2 px-5 py-16 text-[13px] text-slate-400">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading follow-ups…
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={<BellOff className="size-5" aria-hidden />}
          title="Nothing to follow up"
          description="Reminders appear here on their scheduled day, based on each campaign's follow-up rules."
        />
      ) : (
        <ul className="divide-y divide-slate-100">
          {tasks.map((task) => {
            const preferred =
              task.record.influencer.profiles.find((profile) => profile.preferredFlag) ??
              task.record.influencer.profiles[0];
            return (
              <li key={task.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/outreach?record=${task.record.id}`}
                        className="text-sm font-medium text-slate-900 hover:text-brand-700"
                      >
                        {task.record.influencer.displayName}
                      </Link>
                      <StatusBadge status={task.record.outreachStatus} />
                      <Badge tone={task.overdue ? "danger" : "warning"}>
                        Follow-up {task.sequence} · {task.overdue ? "overdue" : "due"}{" "}
                        {relativeTime(task.dueAt)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[12px] text-slate-500">
                      {task.record.campaign.name} · {task.record.campaign.client}
                      {task.previousSentAt
                        ? ` · first message ${formatDate(task.previousSentAt)}`
                        : ""}
                      {task.assignedTo ? ` · ${task.assignedTo.name}` : ""}
                    </p>
                    {task.previousMessage ? (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-[12px] font-medium text-brand-600 hover:text-brand-700">
                          Show the message that was sent
                        </summary>
                        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-mono text-[11px] leading-5 text-slate-600">
                          {task.previousMessage}
                        </pre>
                      </details>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {task.previousMessage ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => copyPrevious(task)}
                        icon={<ClipboardCopy className="size-3.5" aria-hidden />}
                      >
                        Copy previous
                      </Button>
                    ) : null}
                    {preferred ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openProfile(preferred.originalUrl)}
                        icon={<ExternalLink className="size-3.5" aria-hidden />}
                      >
                        Open profile
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="success"
                      disabled={busyId === task.id}
                      onClick={() => update(task, "COMPLETED")}
                      icon={
                        busyId === task.id ? (
                          <Loader2 className="size-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Check className="size-3.5" aria-hidden />
                        )
                      }
                    >
                      I sent it
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyId === task.id}
                      onClick={() => update(task, "CANCELLED")}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
