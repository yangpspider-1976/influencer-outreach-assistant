"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ClipboardPaste, ExternalLink, Loader2, Search } from "lucide-react";
import { api, ClientApiError } from "@/lib/client-api";
import {
  buildManualSearchUrl,
  extractProfileUrlsFromText,
  parseManualProfileUrls,
  type DiscoveryResult,
} from "@/lib/discovery";
import { Button, buttonClasses } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, SelectMenu, Textarea } from "@/components/ui/form";
import { MultiSelect } from "@/components/ui/multi-select";
import { Badge, Callout, Card, CardHeader, EmptyState } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

type SearchResponse = {
  provider: string;
  query: string;
  requestedLimit: number;
  results: DiscoveryResult[];
};

type SaveResponse = {
  created: number;
  linkedExisting: number;
  saved: {
    normalizedUrl: string;
    influencerId: string;
    displayName: string;
    created: boolean;
  }[];
};

export function DiscoveryWorkspace({
  configured,
  canSave,
  categoryOptions,
  locationOptions,
}: {
  configured: boolean;
  canSave: boolean;
  categoryOptions: string[];
  locationOptions: readonly string[];
}) {
  const toast = useToast();
  const [keywords, setKeywords] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [channels, setChannels] = useState<("INSTAGRAM" | "FACEBOOK")[]>([
    "INSTAGRAM",
    "FACEBOOK",
  ]);
  const [limit, setLimit] = useState(10);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [clipboardReading, setClipboardReading] = useState(false);
  const [manualReady, setManualReady] = useState(false);
  const [manualUrls, setManualUrls] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const hasCriteria = Boolean(
    keywords.trim() || selectedCategories.length > 0 || selectedLocations.length > 0,
  );
  // A saved creator is stamped with a category/location only when the filter is
  // unambiguous (exactly one chosen); otherwise it is left for manual review.
  const saveCategory = selectedCategories.length === 1 ? selectedCategories[0] : "";
  const saveLocation = selectedLocations.length === 1 ? selectedLocations[0] : "";
  const selectable = useMemo(
    () => response?.results.filter((result) => !result.existingInfluencer) ?? [],
    [response],
  );
  const manualParsed = useMemo(
    () => parseManualProfileUrls(manualUrls, limit, channels),
    [channels, limit, manualUrls],
  );
  const manualLinks = useMemo(
    () =>
      channels.map((channel) => ({
        channel,
        href: buildManualSearchUrl(
          {
            keywords,
            categories: selectedCategories,
            locations: selectedLocations,
            channels,
            limit,
          },
          channel,
        ),
      })),
    [channels, keywords, limit, selectedCategories, selectedLocations],
  );

  function toggleChannel(channel: "INSTAGRAM" | "FACEBOOK") {
    setChannels((current) =>
      current.includes(channel)
        ? current.filter((entry) => entry !== channel)
        : [...current, channel],
    );
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured) {
      setManualReady(true);
      setManualError(null);
      return;
    }
    setSearching(true);
    setError(null);
    setSelected(new Set());
    try {
      const result = await api.post<SearchResponse>("/api/discovery/search", {
        keywords,
        categories: selectedCategories,
        locations: selectedLocations,
        channels,
        limit,
      });
      setResponse(result);
    } catch (caught) {
      setResponse(null);
      setError(caught instanceof ClientApiError ? caught.message : "Search failed. Try again.");
    } finally {
      setSearching(false);
    }
  }

  function prepareManualSearch() {
    setManualReady(true);
    setManualError(null);
  }

  async function importFromClipboard() {
    if (!navigator.clipboard?.readText) {
      setManualError("Clipboard access is unavailable in this browser. Paste the links manually.");
      return;
    }

    setClipboardReading(true);
    setManualError(null);
    try {
      const clipboardText = await navigator.clipboard.readText();
      const links = extractProfileUrlsFromText(clipboardText);
      if (links.length === 0) {
        setManualError(
          "No direct Instagram or Facebook profile links were found on the clipboard.",
        );
        return;
      }

      setManualUrls((current) => {
        const existing = extractProfileUrlsFromText(current);
        return [...new Set([...existing, ...links])].join("\n");
      });
      toast.success(
        "Profile links imported",
        `${links.length} link${links.length === 1 ? "" : "s"} read from the clipboard.`,
      );
    } catch {
      setManualError(
        "Clipboard access was blocked. Allow clipboard access or paste the links manually.",
      );
    } finally {
      setClipboardReading(false);
    }
  }

  function toggleResult(normalizedUrl: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(normalizedUrl)) next.delete(normalizedUrl);
      else next.add(normalizedUrl);
      return next;
    });
  }

  function toggleAll() {
    setSelected((current) =>
      current.size === selectable.length
        ? new Set()
        : new Set(selectable.map((result) => result.normalizedUrl)),
    );
  }

  async function saveSelected() {
    if (!response || selected.size === 0) return;
    const chosen = response.results.filter((result) => selected.has(result.normalizedUrl));
    setSaving(true);
    setError(null);
    try {
      const result = await api.post<SaveResponse>("/api/discovery/save", {
        category: saveCategory,
        location: saveLocation,
        profiles: chosen.map((profile) => ({
          platform: profile.platform,
          profileUrl: profile.profileUrl,
          displayName: profile.displayName,
        })),
      });
      const savedByUrl = new Map(result.saved.map((entry) => [entry.normalizedUrl, entry]));
      setResponse((current) =>
        current
          ? {
              ...current,
              results: current.results.map((profile) => {
                const saved = savedByUrl.get(profile.normalizedUrl);
                return saved
                  ? {
                      ...profile,
                      existingInfluencer: {
                        id: saved.influencerId,
                        displayName: saved.displayName,
                      },
                    }
                  : profile;
              }),
            }
          : current,
      );
      setSelected(new Set());
      toast.success(
        "Discovery results saved",
        `${result.created} new creator${result.created === 1 ? "" : "s"} added${
          result.linkedExisting ? `; ${result.linkedExisting} already existed` : ""
        }.`,
      );
    } catch (caught) {
      setError(caught instanceof ClientApiError ? caught.message : "Save failed. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function saveManualProfiles() {
    if (manualParsed.profiles.length === 0) return;
    setManualSaving(true);
    setManualError(null);
    try {
      const result = await api.post<SaveResponse>("/api/discovery/save", {
        category: saveCategory,
        location: saveLocation,
        profiles: manualParsed.profiles.map((profile) => ({
          platform: profile.platform,
          profileUrl: profile.profileUrl,
          displayName: profile.displayName,
        })),
      });
      setManualUrls("");
      toast.success(
        "Reviewed profiles saved",
        `${result.created} new creator${result.created === 1 ? "" : "s"} added${
          result.linkedExisting ? `; ${result.linkedExisting} already existed` : ""
        }.`,
      );
    } catch (caught) {
      setManualError(
        caught instanceof ClientApiError ? caught.message : "Save failed. Try again.",
      );
    } finally {
      setManualSaving(false);
    }
  }

  return (
    <div className="mt-7 space-y-6">
      <Card>
        <CardHeader
          title="Find creators"
          description="Set the audience criteria once, then search Instagram and Facebook from the guided review step."
          action={
            <Badge tone={configured ? "positive" : "info"}>
              {configured ? "Automatic search available" : "Manual search"}
            </Badge>
          }
        />
        <form onSubmit={search} className="p-5">
          {!configured ? (
            <Callout tone="info" title="No paid provider required" className="mb-5">
              The free workflow opens targeted browser searches and imports the profile links you
              copy. A server API key is only needed to return results automatically.
            </Callout>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-3">
            <Field
              label="Keywords"
              htmlFor="discovery-keywords"
              hint="Optional. Niche, content style, audience, or campaign topic."
            >
              <Input
                id="discovery-keywords"
                value={keywords}
                onChange={(event) => setKeywords(event.target.value)}
                placeholder="e.g. Korean food reels"
                maxLength={200}
                disabled={searching}
              />
            </Field>
            <Field
              label="Category"
              htmlFor="discovery-category"
              hint="Choose one, several, or all."
            >
              <MultiSelect
                id="discovery-category"
                options={categoryOptions}
                selected={selectedCategories}
                onChange={setSelectedCategories}
                placeholder="Any category"
                allLabel="All categories"
                disabled={searching}
              />
            </Field>
            <Field
              label="Location"
              htmlFor="discovery-location"
              hint="Metro Manila cities."
            >
              <MultiSelect
                id="discovery-location"
                options={locationOptions}
                selected={selectedLocations}
                onChange={setSelectedLocations}
                placeholder="Any location"
                allLabel="All Metro Manila"
                disabled={searching}
              />
            </Field>
          </div>

          <div className="-mx-5 -mb-5 mt-5 flex flex-col gap-4 border-t border-slate-200 bg-slate-50/70 px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid gap-4 sm:grid-cols-[minmax(240px,1fr)_180px]">
              <Field label="Channels" required>
                <div className="flex min-h-9 flex-wrap items-center gap-5">
                  <Checkbox
                    id="discovery-instagram"
                    label="Instagram"
                    checked={channels.includes("INSTAGRAM")}
                    onChange={() => toggleChannel("INSTAGRAM")}
                    disabled={searching}
                  />
                  <Checkbox
                    id="discovery-facebook"
                    label="Facebook"
                    checked={channels.includes("FACEBOOK")}
                    onChange={() => toggleChannel("FACEBOOK")}
                    disabled={searching}
                  />
                </div>
              </Field>
              <Field label="Maximum results" htmlFor="discovery-limit">
                <SelectMenu
                  id="discovery-limit"
                  value={String(limit)}
                  onChange={(value) => setLimit(Number(value))}
                  disabled={searching}
                >
                  <option value={5}>5 results</option>
                  <option value={10}>10 results</option>
                  <option value={20}>20 results</option>
                </SelectMenu>
              </Field>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              {configured ? (
                <Button
                  type="submit"
                  className="order-2"
                  disabled={searching || channels.length === 0 || !hasCriteria}
                  icon={
                    searching ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Search className="size-4" aria-hidden />
                    )
                  }
                >
                  {searching ? "Searching…" : "Search automatically"}
                </Button>
              ) : null}
              <Button
                type={configured ? "button" : "submit"}
                className="order-1"
                variant={configured ? "secondary" : "primary"}
                onClick={configured ? prepareManualSearch : undefined}
                disabled={searching || channels.length === 0 || !hasCriteria}
                icon={<ChevronDown className="size-4" aria-hidden />}
              >
                Manual search
              </Button>
            </div>
          </div>
          {error ? (
            <div className="mt-5">
              <FormError>{error}</FormError>
            </div>
          ) : null}
        </form>
      </Card>

      {manualReady ? (
        <Card>
          <CardHeader
            title="Review and add profiles"
            description="Open a targeted search, copy the profiles you want, then import them from the clipboard."
            action={
              <Badge tone={manualParsed.profiles.length > 0 ? "positive" : "neutral"}>
                {manualParsed.profiles.length} of {limit} ready
              </Badge>
            }
          />
          <div className="grid lg:grid-cols-[300px_minmax(0,1fr)]">
            <div className="border-b border-slate-200 bg-slate-50/70 p-5 lg:border-r lg:border-b-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Step 1 · Search sources
              </p>
              <p className="mt-2 text-[13px] leading-5 text-slate-600">
                Review the results and copy the direct creator profile links you want to keep.
              </p>
              <div className="mt-4 space-y-2">
                {manualLinks.map(({ channel, href }) => (
                  <a
                    key={channel}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonClasses("secondary", "md", "w-full justify-between")}
                  >
                    Search {channel === "INSTAGRAM" ? "Instagram" : "Facebook"}
                    <ExternalLink className="size-4" aria-hidden />
                  </a>
                ))}
              </div>
              <p className="mt-4 text-[12px] leading-5 text-slate-500">
                Search results open in a new tab. The app cannot read that tab, so copy profile
                links there and return here.
              </p>
            </div>

            <div className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Step 2 · Import links
                  </p>
                  <p className="mt-1 text-[13px] leading-5 text-slate-600">
                    Paste manually, or let the app extract profile links from copied result text.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={importFromClipboard}
                  disabled={clipboardReading || manualSaving}
                  icon={
                    clipboardReading ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <ClipboardPaste className="size-4" aria-hidden />
                    )
                  }
                >
                  {clipboardReading ? "Reading…" : "Paste from clipboard"}
                </Button>
              </div>

              <Field
                label="Profile URLs"
                htmlFor="manual-profile-urls"
                hint={`Instagram or Facebook profile URLs, one per line. Maximum ${limit}.`}
                className="mt-4"
              >
                <Textarea
                  id="manual-profile-urls"
                  rows={5}
                  value={manualUrls}
                  onChange={(event) => setManualUrls(event.target.value)}
                  placeholder={
                    "https://www.instagram.com/creatorname/\nhttps://www.facebook.com/creatorname/"
                  }
                  disabled={manualSaving}
                />
              </Field>

              {manualError ? (
                <div className="mt-3">
                  <FormError>{manualError}</FormError>
                </div>
              ) : null}

              {manualUrls.trim() ? (
                <div className="mt-4 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={manualParsed.profiles.length > 0 ? "positive" : "neutral"}>
                      {manualParsed.profiles.length} valid
                    </Badge>
                    {manualParsed.errors.length > 0 ? (
                      <Badge tone="warning">{manualParsed.errors.length} not included</Badge>
                    ) : null}
                  </div>

                  {manualParsed.profiles.length > 0 ? (
                    <ul className="max-h-40 divide-y divide-slate-100 overflow-auto rounded-lg border border-slate-200 bg-white">
                      {manualParsed.profiles.map((profile) => (
                        <li
                          key={`${profile.platform}:${profile.normalizedUrl}`}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-[12px]"
                        >
                          <span className="min-w-0 truncate font-mono text-slate-600">
                            {profile.profileUrl}
                          </span>
                          <Badge tone={profile.platform === "INSTAGRAM" ? "progress" : "info"}>
                            {profile.platform === "INSTAGRAM" ? "Instagram" : "Facebook"}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {manualParsed.errors.length > 0 ? (
                    <Callout tone="warning" title="Some entries need attention">
                      <ul className="mt-1 space-y-1">
                        {manualParsed.errors.slice(0, 3).map((entry, index) => (
                          <li key={`${entry.input}:${index}`} className="break-all">
                            {entry.message}
                          </li>
                        ))}
                      </ul>
                      {manualParsed.errors.length > 3 ? (
                        <p className="mt-1">
                          And {manualParsed.errors.length - 3} more excluded entries.
                        </p>
                      ) : null}
                    </Callout>
                  ) : null}
                </div>
              ) : null}

              {canSave ? (
                <div className="mt-5 flex justify-end border-t border-slate-200 pt-4">
                  <Button
                    onClick={saveManualProfiles}
                    disabled={manualSaving || manualParsed.profiles.length === 0}
                    icon={
                      manualSaving ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : undefined
                    }
                  >
                    {manualSaving
                      ? "Saving…"
                      : `Save valid profiles (${manualParsed.profiles.length})`}
                  </Button>
                </div>
              ) : (
                <Callout tone="info" title="Search and review access" className="mt-5">
                  Your role can prepare creator links here. A Campaign Manager or Administrator
                  must add them to the influencer database.
                </Callout>
              )}
            </div>
          </div>
        </Card>
      ) : null}

      {response ? (
        <Card>
          <CardHeader
            title={`${response.results.length} discovery result${
              response.results.length === 1 ? "" : "s"
            }`}
            description={`Returned by ${response.provider}. Review profile links before saving; follower counts and contact details are not collected.`}
            action={
              canSave && response.results.length > 0 ? (
                <div className="flex items-center gap-2">
                  {selectable.length > 0 ? (
                    <Button variant="secondary" size="sm" onClick={toggleAll}>
                      {selected.size === selectable.length ? "Clear selection" : "Select all new"}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    onClick={saveSelected}
                    disabled={selected.size === 0 || saving}
                    icon={
                      saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : undefined
                    }
                  >
                    {saving ? "Saving…" : `Save selected (${selected.size})`}
                  </Button>
                </div>
              ) : null
            }
          />

          {response.results.length === 0 ? (
            <EmptyState
              title="No profile links found"
              description="Broaden the keywords or location, or try one channel at a time."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {response.results.map((result) => {
                const isSaved = Boolean(result.existingInfluencer);
                return (
                  <li key={`${result.platform}:${result.normalizedUrl}`} className="p-5">
                    <div className="flex items-start gap-3">
                      {canSave ? (
                        <input
                          type="checkbox"
                          className="mt-1 size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          checked={selected.has(result.normalizedUrl)}
                          onChange={() => toggleResult(result.normalizedUrl)}
                          disabled={isSaved || saving}
                          aria-label={`Select ${result.displayName}`}
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-slate-900">{result.displayName}</p>
                          <Badge tone={result.platform === "INSTAGRAM" ? "progress" : "info"}>
                            {result.platform === "INSTAGRAM" ? "Instagram" : "Facebook"}
                          </Badge>
                          {result.existingInfluencer ? (
                            <Badge tone="positive">Already in database</Badge>
                          ) : (
                            <Badge>New result</Badge>
                          )}
                        </div>
                        {result.description ? (
                          <p className="mt-1.5 max-w-4xl text-[13px] leading-5 text-slate-500">
                            {result.description}
                          </p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px]">
                          <a
                            href={result.profileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-medium text-brand-600 hover:text-brand-700"
                          >
                            Review profile
                            <ExternalLink className="size-3" aria-hidden />
                          </a>
                          <span className="font-mono text-slate-400">{result.normalizedUrl}</span>
                          {result.existingInfluencer ? (
                            <Link
                              href={`/influencers/${result.existingInfluencer.id}`}
                              className="font-medium text-slate-600 hover:text-slate-900"
                            >
                              Open saved creator
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ) : null}
    </div>
  );
}
