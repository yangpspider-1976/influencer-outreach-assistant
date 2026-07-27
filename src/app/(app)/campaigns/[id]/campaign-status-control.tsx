"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectMenu } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client-api";

const NEXT_STATUSES: Record<string, { value: string; label: string }[]> = {
  DRAFT: [{ value: "ACTIVE", label: "Activate" }],
  ACTIVE: [
    { value: "PAUSED", label: "Pause" },
    { value: "COMPLETED", label: "Mark completed" },
  ],
  PAUSED: [
    { value: "ACTIVE", label: "Resume" },
    { value: "COMPLETED", label: "Mark completed" },
  ],
  COMPLETED: [
    { value: "ACTIVE", label: "Reopen" },
    { value: "ARCHIVED", label: "Archive" },
  ],
  ARCHIVED: [],
};

export function CampaignStatusControl({
  campaignId,
  status,
  readiness,
}: {
  campaignId: string;
  status: string;
  readiness: { ready: boolean; blockers: string[]; warnings: string[] };
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const options = NEXT_STATUSES[status] ?? [];
  const [target, setTarget] = useState(options[0]?.value ?? "");

  if (options.length === 0) return null;

  async function apply(nextStatus: string) {
    setPending(true);
    try {
      const result = await api.post<{ warnings: string[] }>(
        `/api/campaigns/${campaignId}/activate`,
        { status: nextStatus },
      );
      toast.success(
        nextStatus === "ACTIVE" ? "Campaign activated" : "Campaign status updated",
        result.warnings?.length ? result.warnings.join(" ") : undefined,
      );
      router.refresh();
    } catch (caught) {
      if (caught instanceof ClientApiError && caught.code === "NOT_READY") {
        const details = caught.details as { blockers?: string[] } | undefined;
        toast.error("Cannot activate yet", details?.blockers?.join(" "));
      } else {
        toast.error(
          "Status change failed",
          caught instanceof ClientApiError ? caught.message : undefined,
        );
      }
    } finally {
      setPending(false);
    }
  }

  if (status === "DRAFT") {
    return (
      <Button
        onClick={() => apply("ACTIVE")}
        disabled={pending || !readiness.ready}
        title={readiness.ready ? "Activate this campaign" : readiness.blockers.join(" ")}
        icon={
          pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Play className="size-4" aria-hidden />
          )
        }
      >
        Activate campaign
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <SelectMenu
        aria-label="Change campaign status"
        value={target}
        onChange={(value) => setTarget(value)}
        className="w-44"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectMenu>
      <Button variant="secondary" onClick={() => apply(target)} disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Apply
      </Button>
    </div>
  );
}
