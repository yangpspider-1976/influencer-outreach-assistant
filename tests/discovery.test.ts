import { describe, expect, it } from "vitest";
import {
  buildDiscoveryQuery,
  buildDiscoverySearchQueries,
  buildManualSearchUrl,
  extractProfileUrlsFromText,
  filterDiscoveryWebResults,
  normalizeDiscoveryResults,
  parseManualProfileUrls,
} from "@/lib/discovery";
import { discoverySearchSchema } from "@/lib/validation";

describe("creator discovery", () => {
  it("builds a channel-scoped query from keywords, category, and location", () => {
    const query = buildDiscoveryQuery({
      keywords: "Korean food reels",
      categories: ["Food"],
      locations: ["Metro Manila"],
      channels: ["INSTAGRAM", "FACEBOOK"],
      limit: 10,
    });

    expect(query).toContain('"Korean food reels"');
    expect(query).toContain("Food creator influencer");
    expect(query).toContain('"Metro Manila"');
    expect(query).toContain("site:instagram.com OR site:facebook.com");
  });

  it("combines multiple categories and locations into OR groups", () => {
    const query = buildDiscoveryQuery({
      keywords: "",
      categories: ["Beauty", "Fashion"],
      locations: ["Makati", "Quezon City"],
      channels: ["INSTAGRAM"],
      limit: 10,
    });

    expect(query).toContain("(Beauty OR Fashion) creator influencer");
    expect(query).toContain('(Makati OR "Quezon City")');
    expect(query).toContain("(site:instagram.com)");
  });

  it("supports TikTok and YouTube in generated discovery queries", () => {
    const query = buildDiscoveryQuery({
      keywords: "gaming streamer",
      categories: ["Gaming"],
      locations: ["Metro Manila"],
      channels: ["TIKTOK", "YOUTUBE"],
      limit: 10,
    });

    expect(query).toContain("site:tiktok.com OR site:youtube.com");

    const searches = buildDiscoverySearchQueries({
      keywords: "gaming streamer",
      categories: ["Gaming"],
      locations: ["Metro Manila"],
      channels: ["TIKTOK", "YOUTUBE"],
      limit: 10,
    });
    expect(searches[0]).toContain("(site:tiktok.com/@)");
    expect(searches[0]).toContain("-inurl:/video/");
    expect(searches[1]).toContain("site:youtube.com/@");
    expect(searches[1]).toContain("-inurl:/shorts/");
  });

  it("targets importable profile paths and broadens all of Metro Manila", () => {
    const youtubeQueries = buildDiscoverySearchQueries({
      keywords: "",
      categories: ["Food"],
      locations: ["Metro Manila"],
      channels: ["YOUTUBE"],
      limit: 5,
    });

    expect(youtubeQueries).toHaveLength(12);
    expect(youtubeQueries[0]).toContain('(YouTuber OR "YouTube creator" OR vlogger)');
    expect(youtubeQueries[0]).toContain("site:youtube.com/@");
    expect(youtubeQueries[0]).toContain("site:youtube.com/channel/");
    expect(youtubeQueries.some((query) => query.includes('"Quezon City"'))).toBe(true);
    expect(youtubeQueries.some((query) => query.includes("Muntinlupa"))).toBe(true);
    expect(youtubeQueries.some((query) => query.includes("Valenzuela"))).toBe(true);

    const tiktokQueries = buildDiscoverySearchQueries({
      keywords: "",
      categories: ["Beauty"],
      locations: ["Metro Manila"],
      channels: ["TIKTOK"],
      limit: 5,
    });
    expect(tiktokQueries[0]).toContain('("TikTok creator" OR TikToker OR influencer)');
    expect(tiktokQueries[0]).toContain("site:tiktok.com/@");
  });

  it("fans automatic discovery into focused channel/category/location queries", () => {
    const queries = buildDiscoverySearchQueries({
      keywords: "",
      categories: ["Pets", "Beauty", "Fashion", "Food"],
      locations: ["Metro Manila"],
      channels: ["INSTAGRAM", "FACEBOOK"],
      limit: 10,
    });

    expect(queries).toHaveLength(12);
    expect(queries[0]).toContain('Pets ("Instagram creator" OR influencer OR blogger)');
    expect(queries[0]).toContain('"Metro Manila"');
    expect(queries[0]).toContain("(site:instagram.com)");
    expect(queries[0]).toContain("-inurl:/reel/");
    expect(queries[1]).toContain("(site:facebook.com)");
    expect(queries[1]).toContain("-inurl:/watch/");
    expect(queries[6]).toContain('Food ("Instagram creator" OR influencer OR blogger)');
    expect(queries[8]).toContain("(pets OR dog OR cat OR pet)");
  });

  it("expands all built-in categories beyond the literal category label", () => {
    const expectations: [string, string][] = [
      ["Beauty", "makeup"],
      ["Fashion", "OOTD"],
      ["Food", "foodie"],
      ["Fitness", "workout"],
      ["Travel", "traveler"],
      ["Lifestyle", "vlog"],
      ["Technology", "gadget"],
      ["Parenting", "family"],
      ["Finance", "investing"],
      ["Health & Wellness", "wellness"],
      ["Entertainment", "comedy"],
      ["Education", "teacher"],
      ["Home & Living", "decor"],
      ["Automotive", "cars"],
      ["Sports", "athlete"],
      ["Photography", "photographer"],
      ["Art & Design", "illustrator"],
      ["Music", "musician"],
      ["Pets", "dog"],
    ];

    for (const [category, expectedTerm] of expectations) {
      const queries = buildDiscoverySearchQueries({
        keywords: "",
        categories: [category],
        locations: ["Metro Manila"],
        channels: ["INSTAGRAM"],
        limit: 5,
      });

      expect(queries.some((query) => query.toLowerCase().includes(expectedTerm.toLowerCase()))).toBe(true);
    }
  });

  it("expands gaming searches into platform, genre, and streamer terms", () => {
    const queries = buildDiscoverySearchQueries({
      keywords: "",
      categories: ["Gaming"],
      locations: ["Metro Manila"],
      channels: ["INSTAGRAM", "FACEBOOK"],
      limit: 5,
    });

    expect(queries).toHaveLength(12);
    expect(queries[0]).toContain('Gaming ("Instagram creator" OR influencer OR blogger)');
    expect(queries[0]).toContain('"Metro Manila"');
    expect(queries[0]).toContain('"Manila Philippines"');
    expect(queries[6]).toContain('"Quezon City"');
    expect(queries.some((query) => query.includes("(gaming OR gamer OR streamer OR esports)"))).toBe(true);
    expect(queries.some((query) => query.includes('"Mobile Legends"'))).toBe(true);
    expect(queries.some((query) => query.includes('"game streamer"'))).toBe(true);
  });

  it("filters category discovery hits that do not look category-related", () => {
    expect(
      filterDiscoveryWebResults(
        [
          {
            title: "JV Wanderer",
            url: "https://www.instagram.com/jvwanderer/",
            description: "Showroom stories in Las Pinas.",
          },
          {
            title: "Manila MLBB Streamer",
            url: "https://www.instagram.com/manilagamer/",
            description: "Mobile Legends and Valorant creator.",
          },
        ],
        ["Gaming"],
      ).map((result) => result.url),
    ).toEqual(["https://www.instagram.com/manilagamer/"]);

    expect(
      filterDiscoveryWebResults(
        [
          {
            title: "Random Lifestyle Page",
            url: "https://www.instagram.com/randomlifestyle/",
            description: "Daily city stories.",
          },
          {
            title: "Manila Food Reviews",
            url: "https://www.instagram.com/manilafoodreviews/",
            description: "Restaurant and cafe content.",
          },
        ],
        ["Food"],
      ).map((result) => result.url),
    ).toEqual(["https://www.instagram.com/manilafoodreviews/"]);
  });

  it("rejects generic gaming platform and community pages", () => {
    expect(
      filterDiscoveryWebResults(
        [
          {
            title: "Welcoming our first creators to the FB family at the Facebook Gaming Summit",
            url: "https://www.facebook.com/facebookgaming",
            description: "Facebook Gaming Creator Summit 2018 in Los Angeles.",
          },
          {
            title: "The Influencers Community PH",
            url: "https://www.instagram.com/influencerscommunity",
            description: "A beauty, lifestyle, and gaming content creator.",
          },
          {
            title: "Don C",
            url: "https://www.instagram.com/doncstudiosph",
            description:
              "Tournament Host | Vlogger | Professional Shoutcaster/Announcer #gamingcommunity",
          },
        ],
        ["Gaming"],
      ).map((result) => result.url),
    ).toEqual(["https://www.instagram.com/doncstudiosph"]);
  });

  it("works with no keywords, category, or location beyond the channel scope", () => {
    const query = buildDiscoveryQuery({
      keywords: "",
      categories: [],
      locations: [],
      channels: ["INSTAGRAM", "FACEBOOK"],
      limit: 10,
    });

    expect(query).toBe("creator influencer (site:instagram.com OR site:facebook.com)");
  });

  it("keeps profile URLs and rejects content URLs and duplicates", () => {
    const results = normalizeDiscoveryResults(
      [
        {
          title: "Manila Food Creator | Instagram",
          url: "https://www.instagram.com/manilafoodcreator/",
          description: "Food and restaurant reels.",
        },
        {
          title: "Duplicate",
          url: "https://instagram.com/MANILAFOODCREATOR/?utm_source=search",
        },
        {
          title: "A reel, not a profile",
          url: "https://www.instagram.com/reel/ABC123/",
        },
        {
          title: "Quezon City Eats - Facebook",
          url: "https://www.facebook.com/quezoncityeats",
        },
      ],
      ["INSTAGRAM", "FACEBOOK"],
      20,
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      platform: "INSTAGRAM",
      normalizedUrl: "instagram.com/manilafoodcreator",
      profileUrl: "https://www.instagram.com/manilafoodcreator",
      displayName: "Manila Food Creator",
    });
    expect(results[1]).toMatchObject({
      platform: "FACEBOOK",
      normalizedUrl: "facebook.com/quezoncityeats",
    });
  });

  it("keeps TikTok and YouTube profile results while rejecting content URLs", () => {
    const results = normalizeDiscoveryResults(
      [
        {
          title: "Manila Gaming Creator | TikTok",
          url: "https://www.tiktok.com/@ManilaGamer/video/123",
          description: "Mobile Legends streamer in Manila.",
        },
        {
          title: "A short, not a channel",
          url: "https://www.youtube.com/shorts/abc123",
        },
        {
          title: "Creator Channel - YouTube",
          url: "https://www.youtube.com/@CreatorChannel/videos",
        },
      ],
      ["TIKTOK", "YOUTUBE"],
      20,
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      platform: "TIKTOK",
      normalizedUrl: "tiktok.com/@manilagamer",
      profileUrl: "https://www.tiktok.com/@manilagamer",
    });
    expect(results[1]).toMatchObject({
      platform: "YOUTUBE",
      normalizedUrl: "youtube.com/@creatorchannel",
      profileUrl: "https://www.youtube.com/@creatorchannel",
    });
  });

  it("requires category, location, and channel and enforces the 20-result maximum", () => {
    // Category and location are both required, even when keywords are present.
    expect(
      discoverySearchSchema.safeParse({
        keywords: "food",
        categories: [],
        locations: [],
        channels: ["INSTAGRAM"],
        limit: 10,
      }).success,
    ).toBe(false);
    // A category without a location is not enough.
    expect(
      discoverySearchSchema.safeParse({
        keywords: "",
        categories: ["Food"],
        locations: [],
        channels: ["INSTAGRAM"],
        limit: 10,
      }).success,
    ).toBe(false);
    // A location without a category is not enough.
    expect(
      discoverySearchSchema.safeParse({
        keywords: "",
        categories: [],
        locations: ["Metro Manila"],
        channels: ["INSTAGRAM"],
        limit: 10,
      }).success,
    ).toBe(false);
    // Category and location together are valid without optional keywords.
    expect(
      discoverySearchSchema.safeParse({
        keywords: "",
        categories: ["Food"],
        locations: ["Metro Manila"],
        channels: ["INSTAGRAM"],
        limit: 10,
      }).success,
    ).toBe(true);
    // No channel selected.
    expect(
      discoverySearchSchema.safeParse({
        keywords: "food",
        categories: ["Food"],
        locations: ["Metro Manila"],
        channels: [],
        limit: 10,
      }).success,
    ).toBe(false);
    // Above the result cap.
    expect(
      discoverySearchSchema.safeParse({
        keywords: "food",
        categories: ["Food"],
        locations: ["Metro Manila"],
        channels: ["INSTAGRAM"],
        limit: 21,
      }).success,
    ).toBe(false);
  });

  it("generates a normal browser-search link scoped to one platform", () => {
    const url = new URL(
      buildManualSearchUrl(
        {
          keywords: "restaurant reels",
          categories: ["Food"],
          locations: ["Makati"],
          channels: ["INSTAGRAM", "FACEBOOK"],
          limit: 10,
        },
        "INSTAGRAM",
      ),
    );

    expect(url.origin).toBe("https://www.google.com");
    expect(url.searchParams.get("q")).toContain("site:instagram.com");
    expect(url.searchParams.get("q")).not.toContain("site:facebook.com");
    expect(url.searchParams.get("q")).toContain("-inurl:/reel/");
  });

  it("parses, validates, deduplicates, and limits manually pasted profile URLs", () => {
    const parsed = parseManualProfileUrls(
      [
        "https://instagram.com/creatorone",
        "https://www.instagram.com/CREATORONE/",
        "https://instagram.com/reel/ABC123",
        "https://facebook.com/creatortwo",
        "https://facebook.com/creatorthree",
      ].join("\n"),
      2,
    );

    expect(parsed.profiles).toEqual([
      {
        platform: "INSTAGRAM",
        profileUrl: "https://www.instagram.com/creatorone",
        normalizedUrl: "instagram.com/creatorone",
        displayName: "@creatorone",
      },
      {
        platform: "FACEBOOK",
        profileUrl: "https://www.facebook.com/creatortwo",
        normalizedUrl: "facebook.com/creatortwo",
        displayName: "@creatortwo",
      },
    ]);
    expect(parsed.errors.map((error) => error.message)).toEqual([
      "Duplicate profile URL.",
      expect.stringContaining("content"),
      "Not included because this search is limited to 2 profiles.",
    ]);
  });

  it("rejects pasted profiles outside the selected channels", () => {
    const parsed = parseManualProfileUrls(
      "https://facebook.com/creatortwo",
      10,
      ["INSTAGRAM"],
    );

    expect(parsed.profiles).toHaveLength(0);
    expect(parsed.errors[0]?.message).toContain("selected channels");
  });

  it("extracts direct profile links from copied search-result text", () => {
    expect(
      extractProfileUrlsFromText(
        [
          "Creator One — https://www.instagram.com/creatorone/",
          "A reel https://instagram.com/reel/ABC123 should be ignored.",
          "Creator Two (facebook.com/creatortwo).",
          "Duplicate: https://instagram.com/CREATORONE?utm_source=search",
        ].join("\n"),
      ),
    ).toEqual([
      "https://www.instagram.com/creatorone",
      "https://www.facebook.com/creatortwo",
    ]);
  });
});
