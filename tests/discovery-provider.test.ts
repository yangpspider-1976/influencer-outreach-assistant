import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Provider selection and web-search mapping for creator discovery.
 *
 * The provider module is `server-only` and imports the API + env chain, so those
 * are mocked (as in tests/dnc-route.test.ts). `env` is a mutable object the tests
 * reassign per case, and `fetch` is stubbed to return provider-shaped payloads.
 */

const envState = vi.hoisted(() => ({
  env: {
    discoveryProvider: "auto",
    serperApiKey: null as string | null,
    braveSearchApiKey: null as string | null,
    googleCseApiKey: null as string | null,
    googleCseId: null as string | null,
    discoverySearchCountry: "ph",
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => envState);
vi.mock("@/lib/api", () => {
  class ApiError extends Error {
    constructor(
      readonly status: number,
      message: string,
      readonly code = "ERROR",
    ) {
      super(message);
      this.name = "ApiError";
    }
  }
  return { ApiError };
});

import { isDiscoveryConfigured, searchCreatorProfiles } from "@/lib/discovery-provider";

// Typed like `fetch` so `mock.calls[i]` exposes the [url, init] arguments the
// assertions inspect, without needing named (unused) params in each impl.
type FetchMock = (url: URL, init: RequestInit) => Promise<unknown>;

const INPUT = {
  keywords: "Food",
  categories: ["Food"],
  locations: ["Metro Manila"],
  channels: ["INSTAGRAM", "FACEBOOK"] as ("INSTAGRAM" | "FACEBOOK")[],
  limit: 10,
};

function reset() {
  envState.env.discoveryProvider = "auto";
  envState.env.serperApiKey = null;
  envState.env.braveSearchApiKey = null;
  envState.env.googleCseApiKey = null;
  envState.env.googleCseId = null;
}

beforeEach(reset);
afterEach(() => vi.restoreAllMocks());

describe("isDiscoveryConfigured", () => {
  it("is false when no provider key is set", () => {
    expect(isDiscoveryConfigured()).toBe(false);
  });

  it("is true once a Google key + id are present", () => {
    envState.env.googleCseApiKey = "key";
    envState.env.googleCseId = "cx";
    expect(isDiscoveryConfigured()).toBe(true);
  });

  it("needs BOTH the Google key and the engine id", () => {
    envState.env.googleCseApiKey = "key";
    expect(isDiscoveryConfigured()).toBe(false);
  });

  it("is true with a Serper key", () => {
    envState.env.serperApiKey = "serper";
    expect(isDiscoveryConfigured()).toBe(true);
  });

  it("is true with a Brave key", () => {
    envState.env.braveSearchApiKey = "brave";
    expect(isDiscoveryConfigured()).toBe(true);
  });

  it("is false when DISCOVERY_PROVIDER=off, even with keys", () => {
    envState.env.discoveryProvider = "off";
    envState.env.googleCseApiKey = "key";
    envState.env.googleCseId = "cx";
    expect(isDiscoveryConfigured()).toBe(false);
  });

  it("respects an explicit provider that lacks its key", () => {
    envState.env.discoveryProvider = "google";
    envState.env.braveSearchApiKey = "brave"; // only brave configured
    expect(isDiscoveryConfigured()).toBe(false);
  });
});

describe("searchCreatorProfiles", () => {
  it("throws a clear 503 when nothing is configured", async () => {
    await expect(searchCreatorProfiles(INPUT)).rejects.toMatchObject({
      status: 503,
      code: "DISCOVERY_NOT_CONFIGURED",
    });
  });

  it("maps Serper organic results to reviewable profiles", async () => {
    envState.env.serperApiKey = "serper";

    const fetchMock = vi.fn<FetchMock>(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        organic: [
          {
            title: "Maria Santos (@mariaeats) • Instagram",
            link: "https://www.instagram.com/mariaeats/",
            snippet: "Food creator in Metro Manila",
          },
          {
            title: "ABC Kitchen",
            link: "https://www.facebook.com/abckitchenph",
            snippet: "Restaurant page",
          },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchCreatorProfiles(INPUT);

    expect(result.provider).toBe("Serper (Google Search)");
    expect(result.results.map((r) => r.normalizedUrl)).toEqual([
      "instagram.com/mariaeats",
      "facebook.com/abckitchenph",
    ]);
    // Serper is a POST with the key in the X-API-KEY header and the query in the body.
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).toContain("google.serper.dev/search");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["X-API-KEY"]).toBe("serper");
    expect(String(init.body)).toContain("site:instagram.com");
    expect(JSON.parse(String(init.body))).toMatchObject({ num: 10 });
  });

  it("continues focused YouTube searches until the requested number of channels is found", async () => {
    envState.env.serperApiKey = "serper";
    let requestIndex = 0;
    const fetchMock = vi.fn<FetchMock>(async (_url, init) => {
      requestIndex += 1;
      const body = JSON.parse(String(init.body)) as { q: string; num: number };
      expect(body.q).toContain("site:youtube.com/@");
      expect(body.q).toContain("site:youtube.com/channel/");
      expect(body.num).toBe(10);

      return {
        ok: true,
        status: 200,
        json: async () => ({
          organic: [
            {
              title: `Metro Manila Food Creator ${requestIndex}`,
              link: `https://www.youtube.com/@manilafood${requestIndex}`,
              snippet: "Filipino food, restaurant reviews, recipes, and cooking videos.",
            },
            {
              title: "A food video, not a channel",
              link: `https://www.youtube.com/watch?v=food${requestIndex}`,
              snippet: "Food in Manila.",
            },
          ],
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchCreatorProfiles({
      keywords: "",
      categories: ["Food"],
      locations: ["Metro Manila"],
      channels: ["YOUTUBE"],
      limit: 5,
    });

    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes("google.serper.dev")),
    ).toHaveLength(5);
    expect(result.results).toHaveLength(5);
    expect(result.results.every((profile) => profile.platform === "YOUTUBE")).toBe(true);
  });

  it("resolves relevant YouTube video results to their creator channels through oEmbed", async () => {
    envState.env.serperApiKey = "serper";
    const fetchMock = vi.fn<FetchMock>(async (url) => {
      if (String(url).includes("youtube.com/oembed")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            author_name: "Maria Eats",
            author_url: "https://www.youtube.com/@MariaEatsPH",
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          organic: [
            {
              title: "Metro Manila Filipino Food Tour",
              link: "https://www.youtube.com/watch?v=food123",
              snippet: "Restaurant reviews, recipes, and Filipino cooking videos.",
            },
          ],
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchCreatorProfiles({
      keywords: "",
      categories: ["Food"],
      locations: ["Metro Manila"],
      channels: ["YOUTUBE"],
      limit: 1,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.results).toEqual([
      expect.objectContaining({
        platform: "YOUTUBE",
        displayName: "Maria Eats",
        normalizedUrl: "youtube.com/@mariaeatsph",
        profileUrl: "https://www.youtube.com/@mariaeatsph",
      }),
    ]);
  });

  it("surfaces Serper's actual rejection reason", async () => {
    envState.env.serperApiKey = "serper";
    vi.stubGlobal(
      "fetch",
      vi.fn<FetchMock>(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ message: "Query pattern not allowed for free accounts." }),
      })),
    );

    await expect(
      searchCreatorProfiles({
        keywords: "",
        categories: ["Gaming"],
        locations: ["Metro Manila"],
        channels: ["YOUTUBE"],
        limit: 5,
      }),
    ).rejects.toMatchObject({
      status: 502,
      code: "DISCOVERY_PROVIDER_ERROR",
      message: "Serper rejected the search: Query pattern not allowed for free accounts.",
    });
  });

  it("merges focused Serper searches across selected channels and categories", async () => {
    envState.env.serperApiKey = "serper";

    const fetchMock = vi.fn<FetchMock>(async (_url, init) => {
      const body = String(init.body);
      const isInstagram = body.includes("site:instagram.com");
      const isPets = body.includes("Pets");
      const handle = `${isPets ? "pets" : "beauty"}${isInstagram ? "ig" : "fb"}`;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          organic: [
            {
              title: `${handle} creator`,
              link: isInstagram
                ? `https://www.instagram.com/${handle}/`
                : `https://www.facebook.com/${handle}`,
              snippet: "Metro Manila creator",
            },
          ],
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchCreatorProfiles({
      ...INPUT,
      keywords: "",
      categories: ["Pets", "Beauty"],
      channels: ["INSTAGRAM", "FACEBOOK"],
      limit: 10,
    });

    expect(fetchMock).toHaveBeenCalledTimes(12);
    expect(result.results.map((r) => r.normalizedUrl)).toEqual([
      "instagram.com/petsig",
      "facebook.com/petsfb",
      "instagram.com/beautyig",
      "facebook.com/beautyfb",
    ]);
  });

  it("prefers Serper over Google and Brave under auto", async () => {
    envState.env.serperApiKey = "serper";
    envState.env.googleCseApiKey = "key";
    envState.env.googleCseId = "cx";
    envState.env.braveSearchApiKey = "brave";
    const fetchMock = vi.fn<FetchMock>(async () => ({ ok: true, status: 200, json: async () => ({ organic: [] }) }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchCreatorProfiles(INPUT);
    expect(result.provider).toBe("Serper (Google Search)");
    expect(String(fetchMock.mock.calls[0][0])).toContain("google.serper.dev");
  });

  it("maps Google Custom Search items to reviewable profiles", async () => {
    envState.env.googleCseApiKey = "key";
    envState.env.googleCseId = "cx";

    const fetchMock = vi.fn<FetchMock>(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          {
            title: "Maria Santos (@mariaeats) • Instagram",
            link: "https://www.instagram.com/mariaeats/",
            snippet: "Food creator in Metro Manila",
          },
          {
            title: "Some Food Post",
            link: "https://www.instagram.com/p/Cabc123/", // a post, must be dropped
            snippet: "",
          },
          {
            title: "ABC Kitchen",
            link: "https://www.facebook.com/abckitchenph",
            snippet: "Restaurant page",
          },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchCreatorProfiles(INPUT);

    expect(result.provider).toBe("Google Programmable Search");
    expect(result.query).toContain("site:instagram.com");
    // The post URL is filtered out; two real profiles remain.
    expect(result.results.map((r) => r.normalizedUrl)).toEqual([
      "instagram.com/mariaeats",
      "facebook.com/abckitchenph",
    ]);
    expect(result.results[0].displayName).toBe("Maria Santos");

    // The request carried the key, engine id and the query.
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("key=key");
    expect(calledUrl).toContain("cx=cx");
  });

  it("prefers Google over Brave under auto when both are configured", async () => {
    envState.env.googleCseApiKey = "key";
    envState.env.googleCseId = "cx";
    envState.env.braveSearchApiKey = "brave";
    const fetchMock = vi.fn<FetchMock>(async () => ({ ok: true, status: 200, json: async () => ({ items: [] }) }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchCreatorProfiles(INPUT);
    expect(result.provider).toBe("Google Programmable Search");
    expect(String(fetchMock.mock.calls[0][0])).toContain("googleapis.com/customsearch");
  });

  it("maps Brave results when Brave is the configured provider", async () => {
    envState.env.braveSearchApiKey = "brave";
    const fetchMock = vi.fn<FetchMock>(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        web: {
          results: [
            {
              title: "Jose Eats (@josereyes)",
              url: "https://instagram.com/josereyes",
              description: "Food creator and restaurant reviews.",
            },
          ],
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchCreatorProfiles(INPUT);
    expect(result.provider).toBe("Brave Search");
    expect(result.results[0].normalizedUrl).toBe("instagram.com/josereyes");
    expect(String(fetchMock.mock.calls[0][0])).toContain("api.search.brave.com");
  });

  it("surfaces the Google daily-quota limit as a 429", async () => {
    envState.env.googleCseApiKey = "key";
    envState.env.googleCseId = "cx";
    vi.stubGlobal("fetch", vi.fn<FetchMock>(async () => ({ ok: false, status: 429, json: async () => ({}) })));

    await expect(searchCreatorProfiles(INPUT)).rejects.toMatchObject({
      status: 429,
      code: "RATE_LIMITED",
    });
  });
});
