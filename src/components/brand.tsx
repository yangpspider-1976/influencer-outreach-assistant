import { cn } from "@/lib/cn";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-[13px] font-bold tracking-tight text-white",
        className,
      )}
      aria-hidden
    >
      Q
    </span>
  );
}

export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark />
      {compact ? null : (
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold leading-4 tracking-tight text-slate-900">
            QROAD
          </span>
          <span className="block truncate text-[11px] leading-4 text-slate-500">
            Outreach Assistant
          </span>
        </span>
      )}
    </span>
  );
}
