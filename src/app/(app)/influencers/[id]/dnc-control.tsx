"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client-api";

/** FR-027 — setting is available to managers; clearing is administrator-only. */
export function DncControl({
  influencerId,
  displayName,
  dncFlag,
  canClear,
}: {
  influencerId: string;
  displayName: string;
  dncFlag: boolean;
  canClear: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function apply(next: boolean) {
    const reason = window.prompt(
      next
        ? `Mark "${displayName}" as do not contact?\n\nGive a reason — it is stored on the record and in the audit log.`
        : `Clear the do-not-contact flag for "${displayName}"?\n\nA written reason of at least 10 characters is required.`,
    );
    if (reason === null) return;

    setBusy(true);
    try {
      const result = await api.post<{ releasedRecords: number }>(
        `/api/influencers/${influencerId}/dnc`,
        { dnc: next, reason },
      );
      toast.success(
        next ? "Marked do not contact" : "Do-not-contact flag cleared",
        next
          ? "Open outreach records were withdrawn and pending follow-ups cancelled."
          : result.releasedRecords > 0
            ? `${result.releasedRecords} campaign record${result.releasedRecords === 1 ? "" : "s"} returned to Not Contacted.`
            : "The change is recorded in the audit log.",
      );
      router.refresh();
    } catch (caught) {
      toast.error("Change rejected", caught instanceof ClientApiError ? caught.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  if (dncFlag) {
    if (!canClear) return null;
    return (
      <Button
        variant="secondary"
        onClick={() => apply(false)}
        disabled={busy}
        icon={
          busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <ShieldCheck className="size-4" aria-hidden />
          )
        }
      >
        Clear do-not-contact
      </Button>
    );
  }

  return (
    <Button
      variant="danger"
      onClick={() => apply(true)}
      disabled={busy}
      icon={
        busy ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <ShieldAlert className="size-4" aria-hidden />
        )
      }
    >
      Mark do not contact
    </Button>
  );
}
