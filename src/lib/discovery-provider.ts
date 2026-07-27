import "server-only";
import { ApiError } from "./api";
import {
  buildDiscoveryQuery,
  buildDiscoverySearchPlans,
  filterDiscoveryWebResults,
  normalizeDiscoveryResults,
  type WebSearchResult,
} from "./discovery";
import { env } from "./env";
import type { DiscoverySearchInput } from "./validation";

/**
 * Creator discovery web-search providers.
 *
 * Discovery finds *public* Instagram/Facebook profile URLs through a general web
 * search engine, then hands them to the operator to review before saving. It
 * never contacts Instagram/Facebook directly, never scrapes a profile, and never
 * collects follower or contact data (§16 / Known Limitations).
 *
 * Three backends are supported, all free-tier and all returning search-index
 * results (not scraped profiles):
 *   - Serper (Google Search API) — real Google results, ~2,500 free searches.
 *   - Google Programmable Search (Custom Search JSON API) — 100 queries/day free.
 *   - Brave Search API — free developer tier.
 *
 * `DISCOVERY_PROVIDER` selects one; the default `auto` uses whichever key is
 * present (in the order they are listed in BACKENDS). Keyless engines are
 * intentionally not used: they block automated requests and scraping their HTML
 * is fragile and against their terms.
 */

type ProviderId = "serper" | "google" | "brave";

type Backend = {
  id: ProviderId;
  label: string;
  isConfigured(): boolean;
  run(query: string, input: DiscoverySearchInput): Promise<WebSearchResult[]>;
};

async function fetchProvider(url: URL, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new ApiError(
      502,
      "The discovery provider could not be reached. Try again.",
      "DISCOVERY_PROVIDER_UNAVAILABLE",
    );
  }
}

// ---------------------------------------------------------------------------
// Serper (Google Search API)
// ---------------------------------------------------------------------------

const serperBackend: Backend = {
  id: "serper",
  label: "Serper (Google Search)",
  isConfigured: () => Boolean(env.serperApiKey),
  async run(query, input) {
    const url = new URL("https://google.serper.dev/search");
    const response = await fetchProvider(url, {
      method: "POST",
      headers: {
        "X-API-KEY": env.serperApiKey!,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        q: query,
        gl: env.discoverySearchCountry,
        hl: "en",
        // Serper returns 10 organic results by default; ask for the batch we need.
        num: Math.min(Math.max(input.limit, 10), 100),
      }),
    });
    if (response.status === 429) {
      throw new ApiError(
        429,
        "Serper has hit its rate or credit limit. Try again later, or add credits at serper.dev.",
        "RATE_LIMITED",
      );
    }
    if (!response.ok) {
      throw new ApiError(
        502,
        "Serper rejected the request. Check SERPER_API_KEY and that free credits remain.",
        "DISCOVERY_PROVIDER_ERROR",
      );
    }
    const payload = (await response.json()) as {
      organic?: { title?: string; link?: string; snippet?: string }[];
    };
    return (payload.organic ?? []).map((item) => ({
      title: item.title,
      url: item.link,
      description: item.snippet,
    }));
  },
};

// ---------------------------------------------------------------------------
// Google Programmable Search (Custom Search JSON API)
// ---------------------------------------------------------------------------

const googleBackend: Backend = {
  id: "google",
  label: "Google Programmable Search",
  isConfigured: () => Boolean(env.googleCseApiKey && env.googleCseId),
  async run(query, input) {
    // Custom Search returns at most 10 results per request; page with `start`
    // until the requested limit is met (bounded to stay within the free quota).
    const perPage = 10;
    const pages = Math.min(Math.ceil(input.limit / perPage), 3);
    const collected: WebSearchResult[] = [];

    for (let page = 0; page < pages; page += 1) {
      const url = new URL("https://www.googleapis.com/customsearch/v1");
      url.searchParams.set("key", env.googleCseApiKey!);
      url.searchParams.set("cx", env.googleCseId!);
      url.searchParams.set("q", query);
      url.searchParams.set("num", String(perPage));
      url.searchParams.set("start", String(page * perPage + 1));
      url.searchParams.set("safe", "active");
      url.searchParams.set("gl", env.discoverySearchCountry);
      url.searchParams.set("lr", "lang_en");

      const response = await fetchProvider(url, { headers: { Accept: "application/json" } });
      if (response.status === 429) {
        throw new ApiError(
          429,
          "Google Programmable Search has hit its daily free quota (100 searches). Try again tomorrow or raise the quota in Google Cloud.",
          "RATE_LIMITED",
        );
      }
      if (!response.ok) {
        throw new ApiError(
          502,
          "Google Programmable Search rejected the request. Check GOOGLE_CSE_API_KEY and GOOGLE_CSE_ID.",
          "DISCOVERY_PROVIDER_ERROR",
        );
      }
      const payload = (await response.json()) as {
        items?: { title?: string; link?: string; snippet?: string }[];
      };
      const items = payload.items ?? [];
      for (const item of items) {
        collected.push({ title: item.title, url: item.link, description: item.snippet });
      }
      // No further pages available.
      if (items.length < perPage) break;
    }

    return collected;
  },
};

// ---------------------------------------------------------------------------
// Brave Search API
// ---------------------------------------------------------------------------

const braveBackend: Backend = {
  id: "brave",
  label: "Brave Search",
  isConfigured: () => Boolean(env.braveSearchApiKey),
  async run(query, input) {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(input.limit));
    url.searchParams.set("country", env.discoverySearchCountry);
    url.searchParams.set("search_lang", "en");
    url.searchParams.set("safesearch", "strict");

    const response = await fetchProvider(url, {
      headers: { Accept: "application/json", "X-Subscription-Token": env.braveSearchApiKey! },
    });
    if (response.status === 429) {
      throw new ApiError(
        429,
        "The Brave Search free tier limit has been reached. Try again shortly.",
        "RATE_LIMITED",
      );
    }
    if (!response.ok) {
      throw new ApiError(
        502,
        "The Brave Search provider rejected the search. Check BRAVE_SEARCH_API_KEY.",
        "DISCOVERY_PROVIDER_ERROR",
      );
    }
    const payload = (await response.json()) as { web?: { results?: WebSearchResult[] } };
    return payload.web?.results ?? [];
  },
};

// Order matters for `auto`: the first configured backend wins. Serper is first
// because it needs only a single key and returns real Google results.
const BACKENDS: Backend[] = [serperBackend, googleBackend, braveBackend];

/** The backend the current configuration will use, or null if none is available. */
function activeBackend(): Backend | null {
  const setting = env.discoveryProvider;
  if (setting === "off") return null;
  // An explicit provider id always selects that backend (even if unconfigured,
  // so the caller gets a clear "not configured" error rather than a fallback).
  const explicit = BACKENDS.find((backend) => backend.id === setting);
  if (explicit) return explicit;
  // "auto" (or any unknown value): the first backend that has a key.
  return BACKENDS.find((backend) => backend.isConfigured()) ?? null;
}

/** True when automatic discovery search can run with the current configuration. */
export function isDiscoveryConfigured(): boolean {
  const backend = activeBackend();
  return backend !== null && backend.isConfigured();
}

export async function searchCreatorProfiles(input: DiscoverySearchInput) {
  const backend = activeBackend();
  if (!backend || !backend.isConfigured()) {
    throw new ApiError(
      503,
      "Automatic creator discovery is not configured. Add a Serper key (SERPER_API_KEY), a Google " +
        "Programmable Search key (GOOGLE_CSE_API_KEY + GOOGLE_CSE_ID), or a Brave key " +
        "(BRAVE_SEARCH_API_KEY) — or use the free guided browser search instead.",
      "DISCOVERY_NOT_CONFIGURED",
    );
  }

  const plans = buildDiscoverySearchPlans(input);
  const collected: WebSearchResult[] = [];
  let results = normalizeDiscoveryResults(collected, input.channels, input.limit);

  for (const plan of plans) {
    const queryInput = {
      ...input,
      // Avoid paging every focused query. Multiple focused searches are better
      // at surfacing profile URLs than deeper pages from one broad query.
      limit: plans.length === 1 ? input.limit : Math.min(input.limit, 10),
    };
    const rawResults = await backend.run(plan.query, queryInput);
    collected.push(...filterDiscoveryWebResults(rawResults, plan.categories));
    results = normalizeDiscoveryResults(collected, input.channels, input.limit);
    if (results.length >= input.limit) break;
  }

  return { provider: backend.label, query: plans[0]?.query ?? buildDiscoveryQuery(input), results };
}
