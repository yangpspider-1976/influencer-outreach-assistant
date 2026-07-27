"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { SelectMenu } from "@/components/ui/form";

export function CampaignPicker({
  basePath,
  campaigns,
  value,
  allowAll = false,
}: {
  basePath: string;
  campaigns: { id: string; label: string }[];
  value: string | null;
  allowAll?: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();

  return (
    <SelectMenu
      aria-label="Campaign"
      className="w-72"
      value={value ?? ""}
      onChange={(next) => {
        const params2 = new URLSearchParams(params.toString());
        if (next) params2.set("campaignId", next);
        else params2.delete("campaignId");
        router.replace(`${basePath}?${params2.toString()}`);
      }}
    >
      {allowAll ? <option value="">All campaigns</option> : null}
      {campaigns.map((campaign) => (
        <option key={campaign.id} value={campaign.id}>
          {campaign.label}
        </option>
      ))}
    </SelectMenu>
  );
}
