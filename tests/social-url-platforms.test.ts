import { describe, expect, it } from "vitest";
import { normalizeProfileUrl } from "@/lib/social-url";

describe("normalizeProfileUrl — TikTok", () => {
  it("normalizes creator handles to one key", () => {
    const keys = new Set(
      [
        "https://www.tiktok.com/@ExampleCreator",
        "https://m.tiktok.com/@examplecreator/",
        "tiktok.com/@examplecreator/video/1234567890",
        "@ExampleCreator",
      ].map((url) => {
        const result = normalizeProfileUrl(url, "TIKTOK");
        expect(result.ok).toBe(true);
        return result.ok ? result.normalizedUrl : "";
      }),
    );

    expect([...keys]).toEqual(["tiktok.com/@examplecreator"]);
  });

  it("rejects content and tag URLs", () => {
    for (const url of [
      "https://www.tiktok.com/tag/manilafood",
      "https://www.tiktok.com/music/original-sound-123",
    ]) {
      const result = normalizeProfileUrl(url, "TIKTOK");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("NOT_A_PROFILE_URL");
    }
  });
});

describe("normalizeProfileUrl — YouTube", () => {
  it("normalizes handle, custom and channel URLs", () => {
    const handle = normalizeProfileUrl("https://www.youtube.com/@ExampleCreator/videos", "YOUTUBE");
    expect(handle.ok && handle.normalizedUrl).toBe("youtube.com/@examplecreator");

    const custom = normalizeProfileUrl("youtube.com/c/ExampleCreator", "YOUTUBE");
    expect(custom.ok && custom.normalizedUrl).toBe("youtube.com/c/examplecreator");

    const channel = normalizeProfileUrl(
      "https://www.youtube.com/channel/UCabcDEF123_-",
      "YOUTUBE",
    );
    expect(channel.ok && channel.normalizedUrl).toBe("youtube.com/channel/UCabcDEF123_-");
  });

  it("rejects video, shorts and playlist URLs", () => {
    for (const url of [
      "https://youtu.be/abc123",
      "https://www.youtube.com/watch?v=abc123",
      "https://www.youtube.com/shorts/abc123",
      "https://www.youtube.com/playlist?list=abc123",
    ]) {
      const result = normalizeProfileUrl(url, "YOUTUBE");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("NOT_A_PROFILE_URL");
    }
  });
});
