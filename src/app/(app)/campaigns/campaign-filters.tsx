"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input, SelectMenu } from "@/components/ui/form";
import { CAMPAIGN_STATUS_META } from "@/lib/status";

export function CampaignFilters({ owners }: { owners: { id: string; name: string }[] }) {
  const router = useRouter();
  const params = useSearchParams();

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`/campaigns?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-3.5">
      <div className="relative min-w-56 flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <Input
          defaultValue={params.get("search") ?? ""}
          placeholder="Search campaign, client or location"
          aria-label="Search campaigns"
          className="pl-9"
          onKeyDown={(event) => {
            if (event.key === "Enter") update("search", event.currentTarget.value.trim());
          }}
        />
      </div>

      <SelectMenu
        aria-label="Filter by status"
        defaultValue={params.get("status") ?? ""}
        className="w-40"
        onChange={(value) => update("status", value)}
      >
        <option value="">All statuses</option>
        {Object.entries(CAMPAIGN_STATUS_META).map(([key, meta]) => (
          <option key={key} value={key}>
            {meta.label}
          </option>
        ))}
      </SelectMenu>

      <SelectMenu
        aria-label="Filter by owner"
        defaultValue={params.get("ownerId") ?? ""}
        className="w-48"
        onChange={(value) => update("ownerId", value)}
      >
        <option value="">All owners</option>
        {owners.map((owner) => (
          <option key={owner.id} value={owner.id}>
            {owner.name}
          </option>
        ))}
      </SelectMenu>
    </div>
  );
}
