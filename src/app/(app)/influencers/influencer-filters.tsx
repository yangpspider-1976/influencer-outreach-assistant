"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input, SelectMenu } from "@/components/ui/form";

export function InfluencerFilters({ categories }: { categories: string[] }) {
  const router = useRouter();
  const params = useSearchParams();

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    router.replace(`/influencers?${next.toString()}`);
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
          aria-label="Search creators"
          placeholder="Search name, email or profile URL"
          defaultValue={params.get("search") ?? ""}
          onKeyDown={(event) => {
            if (event.key === "Enter") update("search", event.currentTarget.value.trim());
          }}
        />
      </div>

      <SelectMenu
        aria-label="Filter by category"
        className="w-44"
        defaultValue={params.get("category") ?? ""}
        onChange={(value) => update("category", value)}
      >
        <option value="">All categories</option>
        {categories.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </SelectMenu>

      <SelectMenu
        aria-label="Filter by channel"
        className="w-40"
        defaultValue={params.get("channel") ?? ""}
        onChange={(value) => update("channel", value)}
      >
        <option value="">All channels</option>
        <option value="INSTAGRAM">Instagram</option>
        <option value="FACEBOOK">Facebook</option>
      </SelectMenu>

      <SelectMenu
        aria-label="Filter by do-not-contact"
        className="w-44"
        defaultValue={params.get("dnc") ?? ""}
        onChange={(value) => update("dnc", value)}
      >
        <option value="">All creators</option>
        <option value="true">Do not contact only</option>
      </SelectMenu>
    </div>
  );
}
