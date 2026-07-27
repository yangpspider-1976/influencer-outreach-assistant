import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { STATUS_META, TONE_CLASSES, type OutreachStatusKey, type StatusTone } from "@/lib/status";

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-5 py-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-[13px] leading-5 text-slate-500">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {breadcrumb ? <div className="mb-1.5">{breadcrumb}</div> : null}
        <h1 className="text-[22px] font-semibold leading-7 tracking-tight text-slate-900">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: StatusTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({
  status,
  className,
}: {
  status: OutreachStatusKey | string;
  className?: string;
}) {
  const meta = STATUS_META[status as OutreachStatusKey];
  if (!meta) return <Badge className={className}>{status}</Badge>;
  return (
    <Badge tone={meta.tone} className={className}>
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          meta.tone === "neutral" && "bg-slate-400",
          meta.tone === "info" && "bg-brand-500",
          meta.tone === "progress" && "bg-indigo-500",
          meta.tone === "positive" && "bg-emerald-500",
          meta.tone === "warning" && "bg-amber-500",
          meta.tone === "danger" && "bg-rose-500",
        )}
      />
      {meta.label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Data display
// ---------------------------------------------------------------------------

export function DefinitionList({
  items,
  columns = 2,
  className,
}: {
  items: { label: string; value: ReactNode }[];
  columns?: 1 | 2 | 3 | 4;
  className?: string;
}) {
  const columnClass =
    columns === 1
      ? "sm:grid-cols-1"
      : columns === 2
        ? "sm:grid-cols-2"
        : columns === 3
          ? "sm:grid-cols-3"
          : "sm:grid-cols-2 lg:grid-cols-4";
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-4", columnClass, className)}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {item.label}
          </dt>
          <dd className="mt-1 text-sm leading-6 text-slate-800 [overflow-wrap:anywhere]">
            {item.value ?? "—"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function StatTile({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3.5",
        accent ? "border-brand-200 bg-brand-50" : "border-slate-200 bg-white",
      )}
    >
      <p
        className={cn(
          "text-[11px] font-semibold uppercase tracking-wider",
          accent ? "text-brand-700" : "text-slate-400",
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 text-2xl font-semibold tabular-nums tracking-tight",
          accent ? "text-brand-800" : "text-slate-900",
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className={cn("mt-1 text-xs", accent ? "text-brand-700/80" : "text-slate-500")}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function ProgressBar({
  value,
  tone = "brand",
  className,
}: {
  value: number;
  tone?: "brand" | "emerald" | "amber";
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-slate-100", className)}>
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500",
          tone === "brand" && "bg-brand-600",
          tone === "emerald" && "bg-emerald-500",
          tone === "amber" && "bg-amber-500",
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {icon ? (
        <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-[13px] leading-6 text-slate-500">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export function TableShell({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-[720px] border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-slate-200 bg-slate-50/60 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500",
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return (
    <td
      className={cn("border-b border-slate-100 px-4 py-3 align-middle text-slate-700", className)}
      {...props}
    />
  );
}

export function Tr({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={cn("transition-colors hover:bg-slate-50/70", className)} {...props} />;
}

// ---------------------------------------------------------------------------
// Callouts
// ---------------------------------------------------------------------------

export function Callout({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const tones = {
    info: "border-brand-200 bg-brand-50 text-brand-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    danger: "border-rose-200 bg-rose-50 text-rose-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  } as const;
  return (
    <div className={cn("rounded-lg border px-4 py-3 text-[13px] leading-6", tones[tone], className)}>
      {title ? <p className="font-semibold">{title}</p> : null}
      {children}
    </div>
  );
}
