"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader } from "@/components/ui/primitives";
import { api } from "@/lib/client-api";
import { formatDateTime } from "@/lib/format";

type Job = {
  id: string;
  entity: string;
  format: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  rowCount: number;
  fileName: string | null;
  errorMessage: string | null;
  createdAt: string;
};

/** §18 — background exports are polled here rather than promised by email. */
export function ExportHistory() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  // Every state update happens after the await, so the effect never triggers a
  // synchronous cascading render.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await api.get<{ jobs: Job[] }>("/api/exports");
        if (active) setJobs(result.jobs);
      } catch {
        // Non-critical panel; a failure here should not break the report page.
        if (active) setJobs([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [reloadToken]);

  // §18 — queued exports are polled until the file is ready.
  useEffect(() => {
    if (!jobs?.some((job) => job.status === "PENDING" || job.status === "PROCESSING")) return;
    const timer = setInterval(reload, 4000);
    return () => clearInterval(timer);
  }, [jobs, reload]);

  if (!jobs || jobs.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title="Your exports"
        description="Generated files are stored privately and downloaded through an authenticated link."
        action={
          <Button variant="ghost" size="sm" onClick={reload} aria-label="Refresh exports">
            <RefreshCw className="size-4" aria-hidden />
          </Button>
        }
      />
      <ul className="divide-y divide-slate-100">
        {jobs.map((job) => (
          <li key={job.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-slate-800">
                {job.fileName ?? `${job.entity} (${job.format})`}
              </span>
              <span className="block text-[12px] text-slate-500">
                {job.rowCount} rows · {formatDateTime(job.createdAt)}
                {job.errorMessage ? ` · ${job.errorMessage}` : ""}
              </span>
            </span>
            <Badge
              tone={
                job.status === "COMPLETED"
                  ? "positive"
                  : job.status === "FAILED"
                    ? "danger"
                    : "warning"
              }
            >
              {job.status === "PENDING" || job.status === "PROCESSING" ? (
                <Loader2 className="size-3 animate-spin" aria-hidden />
              ) : null}
              {job.status.toLowerCase()}
            </Badge>
            {job.status === "COMPLETED" ? (
              <a
                href={`/api/exports/${job.id}/download`}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-600 hover:text-brand-700"
              >
                <Download className="size-4" aria-hidden />
                Download
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}
