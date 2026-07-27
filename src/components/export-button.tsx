"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectMenu } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client-api";

type ExportEntity = "campaign_records" | "influencers" | "follow_ups" | "audit_logs";

/**
 * FR-026 / AC-011 — requests a filtered export and downloads the generated
 * file through the authenticated download route.
 */
export function ExportButton({
  entity,
  filters,
  label = "Export",
}: {
  entity: ExportEntity;
  filters: Record<string, string | null>;
  label?: string;
}) {
  const toast = useToast();
  const [format, setFormat] = useState<"CSV" | "XLSX">("CSV");
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const result = await api.post<{
        job: { id: string; status: string; rowCount: number };
        queued: boolean;
      }>("/api/exports", { entity, format, filters });

      if (result.queued || result.job.status !== "COMPLETED") {
        toast.info(
          "Export queued",
          `${result.job.rowCount} rows exceed the synchronous limit. Check back shortly — the file appears under Reports.`,
        );
        return;
      }

      window.location.href = `/api/exports/${result.job.id}/download`;
      toast.success("Export ready", `${result.job.rowCount} rows exported.`);
    } catch (caught) {
      toast.error("Export failed", caught instanceof ClientApiError ? caught.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <SelectMenu
        aria-label="Export format"
        className="w-24"
        value={format}
        onChange={(value) => setFormat(value as "CSV" | "XLSX")}
      >
        <option value="CSV">CSV</option>
        <option value="XLSX">XLSX</option>
      </SelectMenu>
      <Button
        variant="secondary"
        onClick={run}
        disabled={busy}
        icon={
          busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Download className="size-4" aria-hidden />
          )
        }
      >
        {label}
      </Button>
    </div>
  );
}
