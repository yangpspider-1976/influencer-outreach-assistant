"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Info,
  Loader2,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Callout, StatTile } from "@/components/ui/primitives";
import { Field, SelectMenu } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client-api";
import { IMPORT_FIELDS, type RowIssue } from "@/lib/import-fields";
import { cn } from "@/lib/cn";

type ImportSession = {
  id: string;
  originalFileName: string;
  sheetName: string | null;
  availableSheets: string[];
  headers: string[];
  mapping: Record<string, string | null>;
  totalRows: number;
};

type ValidatedRow = {
  id: string;
  rowNumber: number;
  status: "VALID" | "WARNING" | "REJECTED" | "IMPORTED" | "SKIPPED";
  selected: boolean;
  issues: RowIssue[];
  normalizedData: {
    displayName: string;
    firstName: string | null;
    category: string;
    location: string;
    followerCountRaw: string | null;
    preferredChannel: string | null;
    profiles: { platform: string; normalizedUrl: string }[];
  };
};

type Step = "upload" | "map" | "review" | "done";

const STEPS: { key: Step; label: string }[] = [
  { key: "upload", label: "Select file" },
  { key: "map", label: "Map columns" },
  { key: "review", label: "Review validation" },
  { key: "done", label: "Summary" },
];

export function ImportWizard({
  campaignId,
  campaignName,
}: {
  campaignId: string;
  campaignName: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [session, setSession] = useState<ImportSession | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [rows, setRows] = useState<ValidatedRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [summary, setSummary] = useState<{
    imported: number;
    created: number;
    linked: number;
    addedToCampaign: number;
    skipped: number;
  } | null>(null);

  const counts = useMemo(
    () => ({
      valid: rows.filter((row) => row.status === "VALID").length,
      warning: rows.filter((row) => row.status === "WARNING").length,
      rejected: rows.filter((row) => row.status === "REJECTED").length,
    }),
    [rows],
  );

  async function upload(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("campaignId", campaignId);
      const result = await api.upload<{ import: ImportSession }>("/api/imports", form);
      setSession(result.import);
      setMapping(result.import.mapping ?? {});
      setStep("map");
      toast.success("File uploaded", `${result.import.totalRows} data rows detected.`);
    } catch (caught) {
      toast.error(
        "Upload rejected",
        caught instanceof ClientApiError ? caught.message : undefined,
      );
    } finally {
      setBusy(false);
    }
  }

  async function validate() {
    if (!session) return;
    setBusy(true);
    try {
      const result = await api.post<{ rows: ValidatedRow[] }>(
        `/api/imports/${session.id}/mapping`,
        { mapping, sheetName: session.sheetName },
      );
      setRows(result.rows);
      setSelected(new Set(result.rows.filter((row) => row.selected).map((row) => row.id)));
      setStep("review");
    } catch (caught) {
      toast.error(
        "Validation failed",
        caught instanceof ClientApiError ? caught.message : undefined,
      );
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!session) return;
    setBusy(true);
    try {
      const result = await api.post<typeof summary>(`/api/imports/${session.id}/commit`, {
        rowIds: [...selected],
      });
      setSummary(result);
      setStep("done");
      toast.success("Import committed", `${result?.imported ?? 0} rows imported.`);
      router.refresh();
    } catch (caught) {
      toast.error(
        "Import rolled back",
        caught instanceof ClientApiError ? caught.message : undefined,
      );
    } finally {
      setBusy(false);
    }
  }

  const activeIndex = STEPS.findIndex((entry) => entry.key === step);

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {STEPS.map((entry, index) => (
          <li key={entry.key} className="flex items-center gap-3">
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-[11px] font-semibold",
                  index < activeIndex
                    ? "bg-brand-600 text-white"
                    : index === activeIndex
                      ? "bg-brand-600 text-white ring-4 ring-brand-100"
                      : "bg-slate-100 text-slate-400",
                )}
              >
                {index < activeIndex ? "✓" : index + 1}
              </span>
              <span
                className={cn(
                  "text-[13px] font-medium",
                  index <= activeIndex ? "text-slate-900" : "text-slate-400",
                )}
              >
                {entry.label}
              </span>
            </span>
            {index < STEPS.length - 1 ? (
              <span className="hidden h-px w-8 bg-slate-200 sm:block" aria-hidden />
            ) : null}
          </li>
        ))}
      </ol>

      {step === "upload" ? (
        <Card>
          <CardHeader
            title="Select an influencer list"
            description={`Rows will be added to "${campaignName}". Accepted formats: .xlsx and .csv.`}
          />
          <div className="p-5">
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const file = event.dataTransfer.files[0];
                if (file) void upload(file);
              }}
              className={cn(
                "flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors",
                dragging ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-slate-50/60",
              )}
            >
              <UploadCloud className="size-8 text-slate-400" aria-hidden />
              <p className="mt-4 text-sm font-medium text-slate-900">
                Drop your file here, or choose one
              </p>
              <p className="mt-1 text-[13px] text-slate-500">
                Expected columns: influencer_name, instagram_url, facebook_url, tiktok_url,
                youtube_url, category, location, followers, notes, tags.
              </p>
              <input
                ref={fileInput}
                type="file"
                accept=".xlsx,.csv"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                }}
              />
              <Button
                className="mt-5"
                onClick={() => fileInput.current?.click()}
                disabled={busy}
                icon={
                  busy ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <FileSpreadsheet className="size-4" aria-hidden />
                  )
                }
              >
                Choose file
              </Button>
            </div>

            <Callout tone="info" className="mt-5">
              The uploaded file is stored in private storage and never served publicly. Follower
              counts are read from your file — this tool never collects them from social platforms.
            </Callout>
          </div>
        </Card>
      ) : null}

      {step === "map" && session ? (
        <Card>
          <CardHeader
            title="Map columns"
            description={`${session.originalFileName} · ${session.totalRows} data rows. Suggested mappings are pre-filled from the header names.`}
            action={
              session.availableSheets.length > 1 ? (
                <SelectMenu
                  aria-label="Worksheet"
                  className="w-48"
                  value={session.sheetName ?? ""}
                  onChange={(value) =>
                    setSession({ ...session, sheetName: value })
                  }
                >
                  {session.availableSheets.map((sheet) => (
                    <option key={sheet} value={sheet}>
                      {sheet}
                    </option>
                  ))}
                </SelectMenu>
              ) : null
            }
          />
          <div className="grid gap-x-6 gap-y-4 p-5 sm:grid-cols-2">
            {IMPORT_FIELDS.map((field) => (
              <Field
                key={field.key}
                label={field.label}
                htmlFor={`map-${field.key}`}
                hint={`e.g. ${field.example}`}
              >
                <SelectMenu
                  id={`map-${field.key}`}
                  value={mapping[field.key] ?? ""}
                  onChange={(value) =>
                    setMapping((current) => ({
                      ...current,
                      [field.key]: value || null,
                    }))
                  }
                >
                  <option value="">Not mapped</option>
                  {session.headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </SelectMenu>
              </Field>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
            <p className="text-[12px] text-slate-500">
              A row needs either a name or a usable profile URL to be importable.
            </p>
            <Button onClick={validate} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Validate rows
            </Button>
          </div>
        </Card>
      ) : null}

      {step === "review" && session ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-4">
            <StatTile label="Total rows" value={rows.length} />
            <StatTile label="Valid" value={counts.valid} accent />
            <StatTile label="Warning" value={counts.warning} />
            <StatTile label="Rejected" value={counts.rejected} />
          </div>

          <Card>
            <CardHeader
              title="Validation results"
              description="Rejected rows cannot be imported. Duplicate and already-in-campaign rows are pre-deselected."
              action={
                <a
                  href={`/api/imports/${session.id}/errors`}
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-600 hover:text-brand-700"
                >
                  <Download className="size-4" aria-hidden />
                  Download error file
                </a>
              }
            />
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full min-w-[840px] text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="w-10 px-4 py-2.5">
                      <input
                        type="checkbox"
                        aria-label="Select all importable rows"
                        className="size-4 rounded border-slate-300 text-brand-600"
                        checked={
                          rows.filter((row) => row.status !== "REJECTED").length > 0 &&
                          rows
                            .filter((row) => row.status !== "REJECTED")
                            .every((row) => selected.has(row.id))
                        }
                        onChange={(event) =>
                          setSelected(
                            event.target.checked
                              ? new Set(
                                  rows
                                    .filter((row) => row.status !== "REJECTED")
                                    .map((row) => row.id),
                                )
                              : new Set(),
                          )
                        }
                      />
                    </th>
                    <th className="px-4 py-2.5">Row</th>
                    <th className="px-4 py-2.5">Creator</th>
                    <th className="px-4 py-2.5">Profiles</th>
                    <th className="px-4 py-2.5">Findings</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 align-top">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Select row ${row.rowNumber}`}
                          className="size-4 rounded border-slate-300 text-brand-600 disabled:opacity-40"
                          disabled={row.status === "REJECTED"}
                          checked={selected.has(row.id)}
                          onChange={() =>
                            setSelected((current) => {
                              const next = new Set(current);
                              if (next.has(row.id)) next.delete(row.id);
                              else next.add(row.id);
                              return next;
                            })
                          }
                        />
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-500">{row.rowNumber}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">
                          {row.normalizedData.displayName || (
                            <span className="text-slate-400">No name</span>
                          )}
                        </p>
                        <p className="mt-0.5 text-[12px] text-slate-500">
                          {[row.normalizedData.category, row.normalizedData.location]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {row.normalizedData.profiles.length === 0 ? (
                          <span className="text-[12px] text-slate-400">None</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {row.normalizedData.profiles.map((profile) => (
                              <li
                                key={profile.normalizedUrl}
                                className="font-mono text-[11px] text-slate-600"
                              >
                                {profile.normalizedUrl}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.issues.length === 0 ? (
                          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-emerald-700">
                            <CheckCircle2 className="size-3.5" aria-hidden />
                            Valid
                          </span>
                        ) : (
                          <ul className="space-y-1">
                            {row.issues.map((issue, index) => (
                              <li
                                key={`${issue.code}-${index}`}
                                className={cn(
                                  "flex items-start gap-1.5 text-[12px] leading-5",
                                  issue.severity === "error"
                                    ? "text-rose-700"
                                    : issue.severity === "warning"
                                      ? "text-amber-700"
                                      : "text-slate-500",
                                )}
                              >
                                {issue.severity === "error" ? (
                                  <XCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                                ) : issue.severity === "warning" ? (
                                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                                ) : (
                                  <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                                )}
                                <span>{issue.message}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
              <p className="text-[13px] text-slate-600">
                <strong className="font-semibold text-slate-900">{selected.size}</strong> row
                {selected.size === 1 ? "" : "s"} selected for import.
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setStep("map")} disabled={busy}>
                  Back to mapping
                </Button>
                <Button onClick={commit} disabled={busy || selected.size === 0}>
                  {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  Commit {selected.size} row{selected.size === 1 ? "" : "s"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {step === "done" && summary ? (
        <Card>
          <CardHeader title="Import complete" description="All selected rows were saved in a single transaction." />
          <div className="grid gap-4 p-5 sm:grid-cols-5">
            <StatTile label="Imported" value={summary.imported} accent />
            <StatTile label="New creators" value={summary.created} />
            <StatTile label="Linked to existing" value={summary.linked} />
            <StatTile label="Added to campaign" value={summary.addedToCampaign} />
            <StatTile label="Blocked (DNC)" value={summary.skipped} />
          </div>
          <div className="flex flex-wrap gap-2 border-t border-slate-200 px-5 py-4">
            <Button onClick={() => router.push(`/campaigns/${campaignId}?tab=audience`)}>
              Open campaign audience
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setStep("upload");
                setSession(null);
                setRows([]);
                setSummary(null);
                setSelected(new Set());
              }}
            >
              Import another file
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
