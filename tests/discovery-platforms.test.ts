import { describe, expect, it } from "vitest";
import { extractProfileUrlsFromText, parseManualProfileUrls } from "@/lib/discovery";

describe("creator discovery platform support", () => {
  it("extracts TikTok and YouTube profile links from copied search-result text", () => {
    expect(
      extractProfileUrlsFromText(
        [
          "TikTok Creator: https://www.tiktok.com/@creatorthree/video/123",
          "YouTube Creator: youtube.com/@creatorfour/videos",
          "YouTube video https://youtu.be/abc123 should be ignored.",
        ].join("\n"),
      ),
    ).toEqual([
      "https://www.tiktok.com/@creatorthree",
      "https://www.youtube.com/@creatorfour",
    ]);
  });

  it("parses manually pasted TikTok and YouTube profile URLs", () => {
    const parsed = parseManualProfileUrls(
      [
        "https://www.tiktok.com/@CreatorThree",
        "https://www.youtube.com/@CreatorFour/videos",
      ].join("\n"),
      10,
      ["TIKTOK", "YOUTUBE"],
    );

    expect(parsed.errors).toEqual([]);
    expect(parsed.profiles).toEqual([
      {
        platform: "TIKTOK",
        profileUrl: "https://www.tiktok.com/@creatorthree",
        normalizedUrl: "tiktok.com/@creatorthree",
        displayName: "@CreatorThree",
      },
      {
        platform: "YOUTUBE",
        profileUrl: "https://www.youtube.com/@creatorfour",
        normalizedUrl: "youtube.com/@creatorfour",
        displayName: "@CreatorFour",
      },
    ]);
  });
});
