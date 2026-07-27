"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus } from "lucide-react";
import { api, ClientApiError } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { CAMPAIGN_STATUS_META } from "@/lib/status";

type CampaignOption = { id: string; name: string; status: string };

/** Adds this creator to an open campaign's audience from the influencer page. */
export function AddToCampaign({
  influencerId,
  campaigns,
  existingCampaignIds,
}: {
  influencerId: string;
  campaigns: CampaignOption[];
  existingCampaignIds: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set(existingCampaignIds));
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function add(campaign: CampaignOption) {
    if (added.has(campaign.id) || pendingId) return;
    setPendingId(campaign.id);
    try {
      await api.post(`/api/campaigns/${campaign.id}/influencers`, { influencerId });
      setAdded((current) => new Set(current).add(campaign.id));
      toast.success("Added to campaign", `This creator was added to ${campaign.name}.`);
      router.refresh();
    } catch (caught) {
      toast.error(
        "Could not add to campaign",
        caught instanceof ClientApiError ? caught.message : undefined,
      );
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="secondary"
        onClick={() => setOpen((value) => !value)}
        icon={<Plus className="size-4" aria-hidden />}
      >
        Add to campaign
      </Button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1.5 w-72 rounded-lg border border-slate-200 bg-white p-1 shadow-lg shadow-slate-900/5">
          {campaigns.length === 0 ? (
            <p className="px-3 py-4 text-center text-[13px] text-slate-500">
              No open campaigns to add to.
            </p>
          ) : (
            <ul className="max-h-72 overflow-auto">
              {campaigns.map((campaign) => {
                const isAdded = added.has(campaign.id);
                const isPending = pendingId === campaign.id;
                return (
                  <li key={campaign.id}>
                    <button
                      type="button"
                      disabled={isAdded || isPending}
                      onClick={() => add(campaign)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left",
                        isAdded
                          ? "cursor-default text-slate-400"
                          : "text-slate-700 hover:bg-slate-50",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium">
                          {campaign.name}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {CAMPAIGN_STATUS_META[campaign.status]?.label ?? campaign.status}
                        </span>
                      </span>
                      {isPending ? (
                        <Loader2 className="size-4 shrink-0 animate-spin text-slate-400" aria-hidden />
                      ) : isAdded ? (
                        <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-emerald-600">
                          <Check className="size-3.5" aria-hidden />
                          Added
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
