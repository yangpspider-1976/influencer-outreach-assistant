import { STATUS_META, type OutreachStatusKey } from "@/lib/status";
import type { StatusCounts } from "@/lib/metrics";

/** Compact stacked funnel used on the dashboard and campaign analytics. */
const SEGMENTS: { key: OutreachStatusKey; color: string }[] = [
  { key: "CONFIRMED", color: "bg-emerald-500" },
  { key: "NEGOTIATING", color: "bg-indigo-500" },
  { key: "INTERESTED", color: "bg-indigo-400" },
  { key: "REPLIED", color: "bg-brand-400" },
  { key: "SENT", color: "bg-brand-600" },
  { key: "FOLLOW_UP_DUE", color: "bg-amber-400" },
  { key: "READY", color: "bg-brand-200" },
  { key: "NOT_CONTACTED", color: "bg-slate-200" },
  { key: "NO_RESPONSE", color: "bg-slate-300" },
  { key: "DECLINED", color: "bg-rose-400" },
  { key: "INVALID", color: "bg-rose-300" },
  { key: "DUPLICATE", color: "bg-amber-200" },
  { key: "DO_NOT_CONTACT", color: "bg-rose-600" },
];

export function FunnelBar({ counts, total }: { counts: StatusCounts; total: number }) {
  const present = SEGMENTS.filter((segment) => (counts[segment.key] ?? 0) > 0);
  const sum = present.reduce((acc, segment) => acc + (counts[segment.key] ?? 0), 0) || 1;

  if (present.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-[13px] text-slate-400">
        No records in this campaign yet.
      </p>
    );
  }

  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
        {present.map((segment) => (
          <div
            key={segment.key}
            className={segment.color}
            style={{ width: `${((counts[segment.key] ?? 0) / sum) * 100}%` }}
            title={`${STATUS_META[segment.key].label}: ${counts[segment.key]}`}
          />
        ))}
      </div>
      <ul className="mt-3.5 flex flex-wrap gap-x-5 gap-y-2">
        {present.map((segment) => (
          <li key={segment.key} className="flex items-center gap-1.5 text-[12px] text-slate-600">
            <span className={`size-2 rounded-sm ${segment.color}`} aria-hidden />
            <span>{STATUS_META[segment.key].label}</span>
            <span className="font-semibold tabular-nums text-slate-900">
              {counts[segment.key]}
            </span>
          </li>
        ))}
        <li className="text-[12px] text-slate-400">of {total} records</li>
      </ul>
    </div>
  );
}
