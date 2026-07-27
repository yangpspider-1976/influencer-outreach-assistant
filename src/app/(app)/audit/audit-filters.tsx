"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input, SelectMenu } from "@/components/ui/form";

export function AuditFilters({ entities }: { entities: string[] }) {
  const router = useRouter();
  const params = useSearchParams();

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    router.replace(`/audit?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-3.5">
      <div className="relative min-w-56 flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <Input
          className="pl-9"
          aria-label="Search audit log"
          placeholder="Search actor, action or record id"
          defaultValue={params.get("search") ?? ""}
          onKeyDown={(event) => {
            if (event.key === "Enter") update("search", event.currentTarget.value.trim());
          }}
        />
      </div>
      <SelectMenu
        aria-label="Filter by entity"
        className="w-52"
        defaultValue={params.get("entity") ?? ""}
        onChange={(value) => update("entity", value)}
      >
        <option value="">All record types</option>
        {entities.map((entity) => (
          <option key={entity} value={entity}>
            {entity}
          </option>
        ))}
      </SelectMenu>
    </div>
  );
}
