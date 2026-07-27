"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, Search, UserPlus } from "lucide-react";
import { api, ClientApiError } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";

type Hit = {
  id: string;
  displayName: string;
  category: string;
  location: string;
};

/** Searches the influencer database and adds an existing creator to the audience. */
export function AddCreatorControl({
  campaignId,
  onAdded,
}: {
  campaignId: string;
  onAdded: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
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

  // Debounced search. State only changes inside the deferred timeout callback,
  // never synchronously in the effect body. When the term is too short the
  // render gates on its length, so stale results are simply not shown.
  useEffect(() => {
    const query = term.trim();
    if (!open || query.length < 2) return;
    let active = true;
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const result = await api.get<{ influencers: Hit[] }>(
          `/api/influencers?search=${encodeURIComponent(query)}&limit=8`,
        );
        if (active) setResults(result.influencers);
      } catch {
        if (active) setResults([]);
      } finally {
        if (active) setSearching(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [term, open]);

  async function add(hit: Hit) {
    setPendingId(hit.id);
    try {
      await api.post(`/api/campaigns/${campaignId}/influencers`, { influencerId: hit.id });
      toast.success("Creator added", `${hit.displayName} was added to the audience.`);
      setTerm("");
      setResults([]);
      setOpen(false);
      onAdded();
    } catch (caught) {
      toast.error(
        "Could not add creator",
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
        size="sm"
        onClick={() => setOpen((value) => !value)}
        icon={<UserPlus className="size-4" aria-hidden />}
      >
        Add creator
      </Button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1.5 w-80 rounded-lg border border-slate-200 bg-white p-2 shadow-lg shadow-slate-900/5">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <Input
              autoFocus
              className="pl-8"
              aria-label="Search the influencer database"
              placeholder="Search the influencer database"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
            />
          </div>
          <div className="mt-1 max-h-64 overflow-auto">
            {term.trim().length < 2 ? (
              <p className="px-2 py-3 text-[12px] text-slate-400">
                Type at least 2 characters to search.
              </p>
            ) : searching ? (
              <p className="flex items-center gap-2 px-2 py-3 text-[12px] text-slate-400">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                Searching…
              </p>
            ) : results.length === 0 ? (
              <p className="px-2 py-3 text-[12px] text-slate-400">No creators found.</p>
            ) : (
              <ul>
                {results.map((hit) => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      disabled={pendingId === hit.id}
                      onClick={() => add(hit)}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left hover:bg-slate-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium text-slate-800">
                          {hit.displayName}
                        </span>
                        <span className="block truncate text-[11px] text-slate-400">
                          {[hit.category, hit.location].filter(Boolean).join(" · ") || "—"}
                        </span>
                      </span>
                      {pendingId === hit.id ? (
                        <Loader2 className="size-4 shrink-0 animate-spin text-slate-400" aria-hidden />
                      ) : (
                        <Plus className="size-4 shrink-0 text-brand-600" aria-hidden />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
