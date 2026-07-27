import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEMPLATE_CONTENT,
  extractTokens,
  findUnresolvedTokens,
  personalizationSimilarity,
  renderTemplate,
} from "@/lib/template";

const FULL_CONTEXT = {
  first_name: "Maria",
  influencer_name: "Maria Santos",
  restaurant_name: "ABC Korean Restaurant",
  campaign_location: "BGC, Taguig",
  visit_period: "10-20 August 2026",
  deliverables: "1 Reel + 3 Stories + location tag",
  compensation: "PHP 5,000 + complimentary meal for two",
  application_deadline: "5 August 2026",
  campaign_manager_name: "Bianca Cruz",
};

/** §9 / FR-015 — variable rendering. */
describe("renderTemplate", () => {
  it("replaces every variable when all values are present", () => {
    const result = renderTemplate(DEFAULT_TEMPLATE_CONTENT, FULL_CONTEXT);
    expect(result.unresolvedRequired).toEqual([]);
    expect(result.text).toContain("Hi Maria,");
    expect(result.text).toContain("ABC Korean Restaurant");
    expect(result.text).toContain("PHP 5,000 + complimentary meal for two");
    expect(findUnresolvedTokens(result.text)).toEqual([]);
  });

  it("leaves unresolved required variables visible so they can be highlighted", () => {
    const result = renderTemplate("Hi {{first_name}}, visit {{restaurant_name}}.", {
      first_name: "Maria",
    });
    expect(result.text).toBe("Hi Maria, visit {{restaurant_name}}.");
    expect(result.unresolvedRequired).toEqual(["restaurant_name"]);
  });

  it("never silently removes a required line", () => {
    const result = renderTemplate("- Compensation: {{compensation}}", {});
    expect(result.text).toBe("- Compensation: {{compensation}}");
    expect(result.removedLines).toBe(0);
  });

  it("removes a line only when the token is explicitly marked optional", () => {
    const template = "- Deadline: {{application_deadline?}}\n- Compensation: {{compensation}}";
    const result = renderTemplate(template, { compensation: "PHP 5,000" });
    expect(result.text).toBe("- Compensation: PHP 5,000");
    expect(result.removedLines).toBe(1);
    expect(result.unresolvedRequired).toEqual([]);
  });

  it("keeps an optional line when the value exists", () => {
    const result = renderTemplate("- Deadline: {{application_deadline?}}", {
      application_deadline: "5 August 2026",
    });
    expect(result.text).toBe("- Deadline: 5 August 2026");
  });

  it("treats blank strings as unresolved", () => {
    const result = renderTemplate("Hi {{first_name}}", { first_name: "   " });
    expect(result.unresolvedRequired).toEqual(["first_name"]);
  });

  it("reports unknown tokens", () => {
    const result = renderTemplate("Hi {{mystery_field}}", {});
    expect(result.unknownTokens).toEqual(["mystery_field"]);
  });

  it("omits the brief link unless the campaign enabled it", () => {
    const withoutLink = renderTemplate("Brief: {{brief_link?}}", { brief_link: null });
    expect(withoutLink.text).toBe("");
    const withLink = renderTemplate("Brief: {{brief_link?}}", {
      brief_link: "https://example.test/brief",
    });
    expect(withLink.text).toBe("Brief: https://example.test/brief");
  });

  it("tolerates whitespace inside the token braces", () => {
    expect(renderTemplate("Hi {{ first_name }}", { first_name: "Maria" }).text).toBe("Hi Maria");
  });
});

describe("extractTokens", () => {
  it("lists each distinct token once", () => {
    const tokens = extractTokens("{{first_name}} {{first_name}} {{compensation}}");
    expect(tokens.map((token) => token.token).sort()).toEqual(["compensation", "first_name"]);
  });

  it("marks the optional variant", () => {
    const tokens = extractTokens("{{application_deadline?}}");
    expect(tokens[0]).toEqual({ token: "application_deadline", optional: true });
  });

  it("resolves conflicting declarations to required", () => {
    const tokens = extractTokens("{{compensation?}} and {{compensation}}");
    expect(tokens[0].optional).toBe(false);
  });
});

/** §12 — repeated identical copy should be flagged, never declared "safe". */
describe("personalizationSimilarity", () => {
  it("returns 1 for identical text", () => {
    expect(personalizationSimilarity("Hello there friend", "Hello there friend")).toBe(1);
  });

  it("returns a high score for near-identical copy", () => {
    const score = personalizationSimilarity(
      "Hi Maria, we would like to invite you to a campaign.",
      "Hi Jose, we would like to invite you to a campaign.",
    );
    expect(score).toBeGreaterThan(0.7);
  });

  it("returns a low score for genuinely different copy", () => {
    const score = personalizationSimilarity(
      "Hi Maria, we loved your Korean barbecue reel last month.",
      "Good afternoon, please confirm your availability for August.",
    );
    expect(score).toBeLessThan(0.3);
  });
});
