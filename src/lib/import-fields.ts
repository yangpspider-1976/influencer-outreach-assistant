/**
 * §8 Import and Validation Specification / §23 Sample Import Template.
 *
 * Pure module: field catalog, header auto-mapping and per-row validation.
 * Database-dependent checks (existing influencer, DNC, already in campaign)
 * are layered on top by src/lib/import-service.ts.
 */

import {
  normalizeFollowerCount,
  normalizeProfileUrl,
  type SocialPlatform,
} from "./social-url";

export type ImportFieldKey =
  | "influencer_name"
  | "first_name"
  | "instagram_url"
  | "facebook_url"
  | "tiktok_url"
  | "youtube_url"
  | "preferred_channel"
  | "category"
  | "location"
  | "followers"
  | "email"
  | "phone"
  | "expected_rate"
  | "notes"
  | "tags";

export type ImportFieldDefinition = {
  key: ImportFieldKey;
  label: string;
  example: string;
  /** At least one of the "identity" fields must resolve for a usable row. */
  identity: boolean;
  aliases: string[];
};

export const IMPORT_FIELDS: ImportFieldDefinition[] = [
  {
    key: "influencer_name",
    label: "Influencer name",
    example: "Maria Santos",
    identity: true,
    aliases: ["influencername", "name", "displayname", "creator", "creatorname", "fullname"],
  },
  {
    key: "first_name",
    label: "First name",
    example: "Maria",
    identity: false,
    aliases: ["firstname", "givenname", "fname"],
  },
  {
    key: "instagram_url",
    label: "Instagram URL",
    example: "https://www.instagram.com/examplecreator/",
    identity: true,
    aliases: ["instagram", "instagramurl", "iglink", "ig", "igurl", "instagramlink", "instagramprofile"],
  },
  {
    key: "facebook_url",
    label: "Facebook URL",
    example: "https://www.facebook.com/examplecreator",
    identity: true,
    aliases: ["facebook", "facebookurl", "fb", "fburl", "fblink", "facebooklink", "facebookprofile", "facebookpage"],
  },
  {
    key: "tiktok_url",
    label: "TikTok URL",
    example: "https://www.tiktok.com/@examplecreator",
    identity: true,
    aliases: ["tiktok", "tiktokurl", "tt", "tturl", "tiktoklink", "tiktokprofile"],
  },
  {
    key: "youtube_url",
    label: "YouTube URL",
    example: "https://www.youtube.com/@examplecreator",
    identity: true,
    aliases: [
      "youtube",
      "youtubeurl",
      "yt",
      "yturl",
      "youtubelink",
      "youtubechannel",
      "youtubeprofile",
    ],
  },
  {
    key: "preferred_channel",
    label: "Preferred channel",
    example: "Instagram",
    identity: false,
    aliases: ["preferredchannel", "channel", "platform", "preferredplatform"],
  },
  {
    key: "category",
    label: "Category",
    example: "Food / Lifestyle",
    identity: false,
    aliases: ["category", "niche", "vertical", "categories"],
  },
  {
    key: "location",
    label: "Location",
    example: "Metro Manila",
    identity: false,
    aliases: ["location", "city", "area", "region", "basedin"],
  },
  {
    key: "followers",
    label: "Follower count",
    example: "85000",
    identity: false,
    aliases: ["followers", "followercount", "follower", "audience", "reach", "followers_count"],
  },
  {
    key: "email",
    label: "Email",
    example: "creator@example.com",
    identity: false,
    aliases: ["email", "emailaddress", "mail", "contactemail"],
  },
  {
    key: "phone",
    label: "Phone",
    example: "+63 900 000 0000",
    identity: false,
    aliases: ["phone", "mobile", "contactnumber", "phonenumber", "contact"],
  },
  {
    key: "expected_rate",
    label: "Expected rate",
    example: "PHP 5,000",
    identity: false,
    aliases: ["expectedrate", "rate", "fee", "quote", "price", "quotedrate"],
  },
  {
    key: "notes",
    label: "Notes",
    example: "Previously posted Korean restaurant content",
    identity: false,
    aliases: ["notes", "note", "remarks", "comment", "comments"],
  },
  {
    key: "tags",
    label: "Tags",
    example: "food;bgc;reels",
    identity: false,
    aliases: ["tags", "tag", "labels", "keywords"],
  },
];

export type ColumnMapping = Partial<Record<ImportFieldKey, string | null>>;

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** FR-008 — suggests a mapping from normalized header names. */
export function suggestMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();

  for (const field of IMPORT_FIELDS) {
    const candidates = [normalizeHeader(field.key), ...field.aliases.map(normalizeHeader)];
    const match = headers.find(
      (header) => !used.has(header) && candidates.includes(normalizeHeader(header)),
    );
    if (match) {
      mapping[field.key] = match;
      used.add(match);
    } else {
      mapping[field.key] = null;
    }
  }
  return mapping;
}

// ---------------------------------------------------------------------------
// Row validation
// ---------------------------------------------------------------------------

export type IssueSeverity = "error" | "warning" | "info";

export type RowIssue = {
  field?: ImportFieldKey | "row";
  code: string;
  message: string;
  severity: IssueSeverity;
};

export type NormalizedProfileInput = {
  platform: SocialPlatform;
  originalUrl: string;
  normalizedUrl: string;
  canonicalUrl: string;
  usernameHint: string | null;
};

export type NormalizedRow = {
  displayName: string;
  firstName: string | null;
  category: string;
  location: string;
  followerCountRaw: string | null;
  followerCountNumeric: number | null;
  email: string | null;
  phone: string | null;
  rate: string | null;
  notes: string;
  tags: string[];
  preferredChannel: SocialPlatform | null;
  profiles: NormalizedProfileInput[];
};

export type RowClassification = "VALID" | "WARNING" | "REJECTED";

export type ValidatedRow = {
  rowNumber: number;
  raw: Record<string, string>;
  normalized: NormalizedRow;
  issues: RowIssue[];
  status: RowClassification;
  /** Rows flagged as duplicates are pre-deselected (§8). */
  selected: boolean;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** SEC-006 — imported text must never carry control characters into the UI. */
export function sanitizeCell(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "")
    .trim();
}

function pick(raw: Record<string, string>, mapping: ColumnMapping, key: ImportFieldKey): string {
  const header = mapping[key];
  if (!header) return "";
  return sanitizeCell(raw[header]);
}

function parseChannel(value: string): SocialPlatform | null {
  const normalized = value.toLowerCase().replace(/[^a-z]/g, "");
  if (["instagram", "ig", "insta"].includes(normalized)) return "INSTAGRAM";
  if (["facebook", "fb", "meta", "messenger"].includes(normalized)) return "FACEBOOK";
  if (["tiktok", "tt"].includes(normalized)) return "TIKTOK";
  if (["youtube", "yt", "youtubechannel"].includes(normalized)) return "YOUTUBE";
  return null;
}

/**
 * Validates one parsed row against the §8 condition table.
 *
 * @param seenNormalizedUrls Normalized URLs already produced by earlier rows of
 *                           the *same* file, used to flag in-file duplicates.
 */
export function validateRow(
  rowNumber: number,
  raw: Record<string, string>,
  mapping: ColumnMapping,
  seenNormalizedUrls: Set<string>,
): ValidatedRow {
  const issues: RowIssue[] = [];

  const displayNameInput = pick(raw, mapping, "influencer_name");
  const firstNameInput = pick(raw, mapping, "first_name");
  const instagramInput = pick(raw, mapping, "instagram_url");
  const facebookInput = pick(raw, mapping, "facebook_url");
  const tiktokInput = pick(raw, mapping, "tiktok_url");
  const youtubeInput = pick(raw, mapping, "youtube_url");
  const channelInput = pick(raw, mapping, "preferred_channel");
  const followersInput = pick(raw, mapping, "followers");
  const emailInput = pick(raw, mapping, "email");

  const profiles: NormalizedProfileInput[] = [];

  const platforms: [ImportFieldKey, string, SocialPlatform][] = [
    ["instagram_url", instagramInput, "INSTAGRAM"],
    ["facebook_url", facebookInput, "FACEBOOK"],
    ["tiktok_url", tiktokInput, "TIKTOK"],
    ["youtube_url", youtubeInput, "YOUTUBE"],
  ];

  for (const [field, input, platform] of platforms) {
    if (!input) continue;
    const result = normalizeProfileUrl(input, platform);
    if (!result.ok) {
      issues.push({
        field,
        code: result.code,
        message: result.message,
        // §8 — "Rejected or warning depending on recoverability".
        severity: result.recoverable ? "warning" : "error",
      });
      continue;
    }
    for (const warning of result.warnings) {
      issues.push({ field, code: "URL_NORMALIZED", message: warning, severity: "info" });
    }
    profiles.push({
      platform: result.platform,
      originalUrl: result.originalUrl,
      normalizedUrl: result.normalizedUrl,
      canonicalUrl: result.canonicalUrl,
      usernameHint: result.usernameHint,
    });
  }

  // §8 — "Exact duplicate in the same uploaded file: warning; default deselected."
  let duplicateInFile = false;
  for (const profile of profiles) {
    if (seenNormalizedUrls.has(profile.normalizedUrl)) {
      duplicateInFile = true;
      issues.push({
        field: fieldForPlatform(profile.platform),
        code: "DUPLICATE_IN_FILE",
        message: `${profile.normalizedUrl} already appears earlier in this file.`,
        severity: "warning",
      });
    } else {
      seenNormalizedUrls.add(profile.normalizedUrl);
    }
  }

  const displayName = displayNameInput || firstNameInput || profiles[0]?.usernameHint || "";

  // §8 — "No name and no usable profile URL: rejected."
  if (!displayName && profiles.length === 0) {
    issues.push({
      field: "row",
      code: "NO_IDENTITY",
      message: "The row has neither a name nor a usable profile URL.",
      severity: "error",
    });
  }

  const email = emailInput || null;
  if (email && !EMAIL_PATTERN.test(email)) {
    issues.push({
      field: "email",
      code: "INVALID_EMAIL",
      message: `"${email}" is not a valid email address; it will be stored but not used.`,
      severity: "warning",
    });
  }

  // §8 — "Both platform URLs missing, email present: warning; may import to the
  // database but not to the Meta outreach queue."
  if (profiles.length === 0 && displayName) {
    issues.push({
      field: "row",
      code: "NO_SOCIAL_PROFILE",
      message: email
        ? "No supported social profile. The creator can be stored but cannot enter the outreach queue."
        : "No supported social profile. The creator cannot enter the outreach queue.",
      severity: "warning",
    });
  }

  // §8 — "Missing preferred channel but one profile exists: infer automatically."
  let preferredChannel = parseChannel(channelInput);
  if (channelInput && !preferredChannel) {
    issues.push({
      field: "preferred_channel",
      code: "UNKNOWN_CHANNEL",
      message: `"${channelInput}" is not a recognized channel; it was inferred instead.`,
      severity: "warning",
    });
  }
  if (!preferredChannel && profiles.length > 0) {
    preferredChannel = profiles[0].platform;
    if (channelInput === "") {
      issues.push({
        field: "preferred_channel",
        code: "CHANNEL_INFERRED",
        message: `Preferred channel was inferred as ${preferredChannel.toLowerCase()}.`,
        severity: "info",
      });
    }
  }
  if (preferredChannel && !profiles.some((p) => p.platform === preferredChannel)) {
    issues.push({
      field: "preferred_channel",
      code: "CHANNEL_WITHOUT_PROFILE",
      message: `Preferred channel is ${preferredChannel.toLowerCase()} but no ${preferredChannel.toLowerCase()} URL was supplied.`,
      severity: "warning",
    });
    preferredChannel = profiles[0]?.platform ?? null;
  }

  // §8 — follower counts normalize only when unambiguous; raw value preserved.
  const followers = normalizeFollowerCount(followersInput);
  if (followers.ambiguous) {
    issues.push({
      field: "followers",
      code: "FOLLOWERS_AMBIGUOUS",
      message: `"${followers.raw}" could not be read as a number; the original value was kept.`,
      severity: "info",
    });
  }

  const tags = pick(raw, mapping, "tags")
    .split(/[;,|]/)
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);

  const normalized: NormalizedRow = {
    displayName,
    firstName: firstNameInput || deriveFirstName(displayName),
    category: pick(raw, mapping, "category"),
    location: pick(raw, mapping, "location"),
    followerCountRaw: followers.raw,
    followerCountNumeric: followers.numeric,
    email,
    phone: pick(raw, mapping, "phone") || null,
    rate: pick(raw, mapping, "expected_rate") || null,
    notes: pick(raw, mapping, "notes"),
    tags,
    preferredChannel,
    profiles,
  };

  const status = classify(issues);
  return {
    rowNumber,
    raw,
    normalized,
    issues,
    status,
    selected: status !== "REJECTED" && !duplicateInFile,
  };
}

export function classify(issues: RowIssue[]): RowClassification {
  if (issues.some((issue) => issue.severity === "error")) return "REJECTED";
  if (issues.some((issue) => issue.severity === "warning")) return "WARNING";
  return "VALID";
}

function fieldForPlatform(platform: SocialPlatform): ImportFieldKey {
  switch (platform) {
    case "INSTAGRAM":
      return "instagram_url";
    case "FACEBOOK":
      return "facebook_url";
    case "TIKTOK":
      return "tiktok_url";
    case "YOUTUBE":
      return "youtube_url";
  }
}

export function deriveFirstName(displayName: string): string | null {
  const first = displayName.trim().split(/\s+/)[0];
  return first ? first : null;
}
