/**
 * FR-010 — Instagram / Facebook profile URL normalization.
 *
 * The normalized form is what the database uniqueness constraint and all
 * duplicate detection run against (FR-011, AC-003). The value the user
 * uploaded is always preserved separately on `SocialProfile.originalUrl`.
 *
 * This module is pure: no network access, no DOM, no scraping (§16).
 */

export type SocialPlatform = "INSTAGRAM" | "FACEBOOK";

export type UrlIssueCode =
  | "EMPTY"
  | "UNSUPPORTED_DOMAIN"
  | "UNSUPPORTED_SCHEME"
  | "NOT_A_PROFILE_URL"
  | "AMBIGUOUS_HANDLE"
  | "MALFORMED";

export type NormalizedProfile = {
  ok: true;
  platform: SocialPlatform;
  originalUrl: string;
  /** Canonical dedupe key, e.g. `instagram.com/examplecreator`. */
  normalizedUrl: string;
  /** Ready-to-open https URL used by the "Open Profile" action (FR-018). */
  canonicalUrl: string;
  usernameHint: string | null;
  warnings: string[];
};

export type UrlNormalizationFailure = {
  ok: false;
  code: UrlIssueCode;
  message: string;
  /** Recoverable failures are surfaced as warnings; the rest reject the row (§8). */
  recoverable: boolean;
};

export type UrlNormalizationResult = NormalizedProfile | UrlNormalizationFailure;

const INSTAGRAM_HOSTS = new Set([
  "instagram.com",
  "www.instagram.com",
  "m.instagram.com",
  "l.instagram.com",
  "instagr.am",
  "www.instagr.am",
]);

const FACEBOOK_HOSTS = new Set([
  "facebook.com",
  "www.facebook.com",
  "m.facebook.com",
  "web.facebook.com",
  "mbasic.facebook.com",
  "business.facebook.com",
  "fb.com",
  "www.fb.com",
  "fb.me",
  "www.fb.me",
]);

/** Path prefixes that are content, not a profile. */
const INSTAGRAM_RESERVED = new Set([
  "p",
  "reel",
  "reels",
  "tv",
  "stories",
  "explore",
  "direct",
  "accounts",
  "about",
  "developer",
  "legal",
  "privacy",
  "challenge",
  "s",
]);

const FACEBOOK_RESERVED = new Set([
  "groups",
  "events",
  "watch",
  "marketplace",
  "photo",
  "photo.php",
  "story.php",
  "sharer",
  "sharer.php",
  "permalink.php",
  "media",
  "search",
  "login",
  "login.php",
  "help",
  "policies",
  "reel",
  "share",
]);

const HANDLE_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

function fail(
  code: UrlIssueCode,
  message: string,
  recoverable = false,
): UrlNormalizationFailure {
  return { ok: false, code, message, recoverable };
}

function stripInvisible(value: string): string {
  // Spreadsheet exports frequently carry zero-width and non-breaking spaces.
  return value.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, " ").trim();
}

function detectPlatformFromHost(host: string): SocialPlatform | null {
  if (INSTAGRAM_HOSTS.has(host)) return "INSTAGRAM";
  if (FACEBOOK_HOSTS.has(host)) return "FACEBOOK";
  return null;
}

/**
 * Normalizes a profile URL or bare handle.
 *
 * @param input          Raw value from the spreadsheet or form.
 * @param expectedPlatform Platform implied by the source column, used to
 *                       resolve bare handles such as `@examplecreator`.
 */
export function normalizeProfileUrl(
  input: string | null | undefined,
  expectedPlatform?: SocialPlatform,
): UrlNormalizationResult {
  const originalUrl = stripInvisible(String(input ?? ""));
  if (!originalUrl) {
    return fail("EMPTY", "No profile URL supplied.");
  }

  const warnings: string[] = [];

  // Reject a non-web scheme before anything else, so a payload such as
  // `javascript:…` can never be mistaken for a handle.
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(originalUrl)?.[1]?.toLowerCase();
  if (scheme && scheme !== "http" && scheme !== "https") {
    return fail("UNSUPPORTED_SCHEME", `Unsupported URL scheme in "${originalUrl}".`);
  }

  // Bare handle (`@name` or `name`) — only resolvable with a known platform.
  if (!originalUrl.includes("/") && !originalUrl.includes(".")) {
    const handle = originalUrl.replace(/^@/, "");
    if (!HANDLE_PATTERN.test(handle)) {
      return fail("MALFORMED", `"${originalUrl}" is not a usable profile URL or handle.`);
    }
    if (!expectedPlatform) {
      return fail(
        "AMBIGUOUS_HANDLE",
        `"${originalUrl}" is a bare handle; the platform cannot be determined.`,
        true,
      );
    }
    warnings.push("A bare handle was supplied; the full profile URL was reconstructed.");
    return buildResult(expectedPlatform, originalUrl, handle.toLowerCase(), warnings);
  }

  const working = /^https?:\/\//i.test(originalUrl) ? originalUrl : `https://${originalUrl}`;

  let url: URL;
  try {
    url = new URL(working);
  } catch {
    return fail("MALFORMED", `"${originalUrl}" could not be parsed as a URL.`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return fail("UNSUPPORTED_SCHEME", `Only http and https profile links are accepted.`);
  }
  if (url.protocol === "http:") {
    warnings.push("The uploaded link used http; https was applied.");
  }

  const host = url.hostname.toLowerCase();
  const platform = detectPlatformFromHost(host);
  if (!platform) {
    return fail(
      "UNSUPPORTED_DOMAIN",
      `"${host}" is not a supported Instagram or Facebook domain.`,
    );
  }
  if (expectedPlatform && platform !== expectedPlatform) {
    warnings.push(
      `The link was supplied in the ${expectedPlatform.toLowerCase()} column but points to ${platform.toLowerCase()}.`,
    );
  }

  const segments = url.pathname.split("/").map(decodeSegment).filter(Boolean);

  if (platform === "FACEBOOK") {
    // profile.php?id=<numeric id> is a legitimate profile form and the id must
    // be preserved — it is the only identifier in the URL.
    const first = segments[0]?.toLowerCase();
    if (first === "profile.php" || (segments.length === 0 && url.searchParams.has("id"))) {
      const id = url.searchParams.get("id");
      if (id && /^\d+$/.test(id)) {
        return buildResult(platform, originalUrl, `profile.php?id=${id}`, warnings, id);
      }
      return fail("NOT_A_PROFILE_URL", `"${originalUrl}" has no usable Facebook profile id.`);
    }
    // /pages/<Slug>/<numeric id> — the numeric id is the stable identifier.
    if (first === "pages") {
      const numeric = segments.find((s) => /^\d+$/.test(s));
      if (numeric) {
        return buildResult(platform, originalUrl, `pages/${numeric}`, warnings, numeric);
      }
      return fail("NOT_A_PROFILE_URL", `"${originalUrl}" is not a usable Facebook Page link.`);
    }
    if (first && FACEBOOK_RESERVED.has(first)) {
      return fail(
        "NOT_A_PROFILE_URL",
        `"${originalUrl}" points to Facebook content, not a profile or Page.`,
        true,
      );
    }
  }

  if (platform === "INSTAGRAM") {
    const first = segments[0]?.toLowerCase();
    if (first && INSTAGRAM_RESERVED.has(first)) {
      return fail(
        "NOT_A_PROFILE_URL",
        `"${originalUrl}" points to Instagram content, not a profile.`,
        true,
      );
    }
  }

  if (segments.length === 0) {
    return fail("NOT_A_PROFILE_URL", `"${originalUrl}" has no profile name in the path.`);
  }

  const handle = segments[0];
  if (!HANDLE_PATTERN.test(handle)) {
    return fail("MALFORMED", `"${handle}" is not a valid profile name.`);
  }
  if (segments.length > 1) {
    // e.g. /examplecreator/reels — the profile is still unambiguous.
    warnings.push("Extra path segments were removed to reach the profile root.");
  }

  return buildResult(platform, originalUrl, handle.toLowerCase(), warnings, handle);
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function buildResult(
  platform: SocialPlatform,
  originalUrl: string,
  pathKey: string,
  warnings: string[],
  usernameHint?: string | null,
): NormalizedProfile {
  const domain = platform === "INSTAGRAM" ? "instagram.com" : "facebook.com";
  return {
    ok: true,
    platform,
    originalUrl,
    normalizedUrl: `${domain}/${pathKey}`,
    canonicalUrl: `https://www.${domain}/${pathKey}`,
    usernameHint: usernameHint ?? pathKey,
    warnings,
  };
}

/**
 * §8 — "Follower count contains commas or K/M suffix: normalize only when
 * unambiguous; preserve raw value."
 */
export function normalizeFollowerCount(raw: string | null | undefined): {
  raw: string | null;
  numeric: number | null;
  ambiguous: boolean;
} {
  const value = stripInvisible(String(raw ?? ""));
  if (!value) return { raw: null, numeric: null, ambiguous: false };

  const cleaned = value.replace(/[\s,_]/g, "");
  const plain = /^\d+$/.exec(cleaned);
  if (plain) return { raw: value, numeric: Number.parseInt(plain[0], 10), ambiguous: false };

  const suffixed = /^(\d+(?:\.\d+)?)([kKmM])$/.exec(cleaned);
  if (suffixed) {
    const base = Number.parseFloat(suffixed[1]);
    const multiplier = suffixed[2].toLowerCase() === "k" ? 1_000 : 1_000_000;
    return { raw: value, numeric: Math.round(base * multiplier), ambiguous: false };
  }

  // Ranges ("50k-80k"), approximations ("~10k") and prose stay raw-only.
  return { raw: value, numeric: null, ambiguous: true };
}
