import Link from "next/link";
import { cn } from "@/lib/cn";

export function TabNav({
  tabs,
  active,
}: {
  tabs: { key: string; label: string; href: string; count?: number }[];
  active: string;
}) {
  return (
    <div className="border-b border-slate-200">
      <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Sections">
        {tabs.map((tab) => {
          const isActive = tab.key === active;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors",
                isActive
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800",
              )}
            >
              {tab.label}
              {tab.count !== undefined ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                    isActive ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500",
                  )}
                >
                  {tab.count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
