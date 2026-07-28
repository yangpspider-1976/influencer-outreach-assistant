import { describe, expect, it } from "vitest";
import { normalizeFollowerCount, normalizeProfileUrl } from "@/lib/social-url";

/** FR-010 / FR-011 / AC-003 — URL normalization and dedupe keys. */
describe("normalizeProfileUrl — Instagram", () => {
  const variants = [
    "https://www.instagram.com/examplecreator/",
    "https://instagram.com/examplecreator",
    "http://m.instagram.com/examplecreator/",
    "instagram.com/examplecreator",
    "www.instagram.com/examplecreator?igshid=abc123",
    "https://www.instagram.com/ExampleCreator/",
    "https://www.instagram.com/examplecreator/reels/",
    "https://instagr.am/examplecreator",
  ];

  it("maps every common variant to one dedupe key", () => {
    const keys = new Set(
      variants.map((variant) => {
        const result = normalizeProfileUrl(variant, "INSTAGRAM");
        expect(result.ok).toBe(true);
        return result.ok ? result.normalizedUrl : "";
      }),
    );
    expect([...keys]).toEqual(["instagram.com/examplecreator"]);
  });

  it("produces an openable canonical https URL", () => {
    const result = normalizeProfileUrl("instagram.com/examplecreator", "INSTAGRAM");
    expect(result.ok && result.canonicalUrl).toBe("https://www.instagram.com/examplecreator");
  });

  it("rejects post and reel links as non-profile URLs", () => {
    for (const url of [
      "https://www.instagram.com/p/Cabc123/",
      "https://www.instagram.com/reel/Cabc123/",
      "https://www.instagram.com/stories/examplecreator/123/",
    ]) {
      const result = normalizeProfileUrl(url, "INSTAGRAM");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("NOT_A_PROFILE_URL");
    }
  });

  it("reconstructs a bare handle when the platform is known", () => {
    const result = normalizeProfileUrl("@ExampleCreator", "INSTAGRAM");
    expect(result.ok && result.normalizedUrl).toBe("instagram.com/examplecreator");
  });

  it("refuses a bare handle when the platform is unknown", () => {
    const result = normalizeProfileUrl("examplecreator");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("AMBIGUOUS_HANDLE");
      expect(result.recoverable).toBe(true);
    }
  });
});

describe("normalizeProfileUrl — Facebook", () => {
  it("normalizes username and mobile variants to one key", () => {
    const keys = new Set(
      [
        "https://www.facebook.com/examplecreator",
        "https://m.facebook.com/examplecreator/",
        "https://web.facebook.com/examplecreator?ref=page_internal",
        "facebook.com/ExampleCreator",
      ].map((url) => {
        const result = normalizeProfileUrl(url, "FACEBOOK");
        return result.ok ? result.normalizedUrl : "";
      }),
    );
    expect([...keys]).toEqual(["facebook.com/examplecreator"]);
  });

  it("preserves the numeric id in profile.php links", () => {
    const result = normalizeProfileUrl(
      "https://www.facebook.com/profile.php?id=100001234567890",
      "FACEBOOK",
    );
    expect(result.ok && result.normalizedUrl).toBe("facebook.com/profile.php?id=100001234567890");
  });

  it("uses the numeric page id for /pages/ links", () => {
    const result = normalizeProfileUrl(
      "https://www.facebook.com/pages/ABC-Korean-Restaurant/123456789",
      "FACEBOOK",
    );
    expect(result.ok && result.normalizedUrl).toBe("facebook.com/pages/123456789");
  });

  it("rejects group and event content links", () => {
    for (const url of [
      "https://www.facebook.com/groups/123456",
      "https://www.facebook.com/events/123456",
    ]) {
      expect(normalizeProfileUrl(url, "FACEBOOK").ok).toBe(false);
    }
  });
});

describe("normalizeProfileUrl — rejections", () => {
  it("rejects unsupported domains", () => {
    const result = normalizeProfileUrl("https://example.com/@creator");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("UNSUPPORTED_DOMAIN");
  });

  it("rejects non-http schemes", () => {
    const result = normalizeProfileUrl("javascript:alert(1)");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("UNSUPPORTED_SCHEME");
  });

  it("rejects empty input", () => {
    expect(normalizeProfileUrl("").ok).toBe(false);
    expect(normalizeProfileUrl(null).ok).toBe(false);
  });

  it("always preserves the uploaded value", () => {
    const original = "  https://www.instagram.com/examplecreator/  ";
    const result = normalizeProfileUrl(original, "INSTAGRAM");
    expect(result.ok && result.originalUrl).toBe(original.trim());
  });
});

/** §8 — follower normalization only when unambiguous. */
describe("normalizeFollowerCount", () => {
  it("parses plain and comma-separated numbers", () => {
    expect(normalizeFollowerCount("85000").numeric).toBe(85000);
    expect(normalizeFollowerCount("85,000").numeric).toBe(85000);
  });

  it("parses unambiguous K and M suffixes", () => {
    expect(normalizeFollowerCount("85K").numeric).toBe(85000);
    expect(normalizeFollowerCount("1.2m").numeric).toBe(1_200_000);
  });

  it("keeps ambiguous values raw", () => {
    const range = normalizeFollowerCount("50k-80k");
    expect(range.numeric).toBeNull();
    expect(range.ambiguous).toBe(true);
    expect(range.raw).toBe("50k-80k");
  });

  it("returns nothing for an empty cell", () => {
    expect(normalizeFollowerCount("")).toEqual({ raw: null, numeric: null, ambiguous: false });
  });
});
