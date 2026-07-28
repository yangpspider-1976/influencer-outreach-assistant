import type { DiscoverySearchInput } from "./validation";
import { normalizeProfileUrl, SOCIAL_PLATFORM_LABELS, type SocialPlatform } from "./social-url";

export type DiscoveryResult = {
  platform: SocialPlatform;
  profileUrl: string;
  normalizedUrl: string;
  username: string | null;
  displayName: string;
  title: string;
  description: string;
  existingInfluencer: { id: string; displayName: string } | null;
};

/** A single web-search hit, provider-agnostic. */
export type WebSearchResult = {
  title?: string;
  url?: string;
  description?: string;
};

/** @deprecated Use {@link WebSearchResult}. Kept for backwards compatibility. */
export type BraveWebResult = WebSearchResult;

export type ManualProfileCandidate = {
  platform: SocialPlatform;
  profileUrl: string;
  normalizedUrl: string;
  displayName: string;
};

const PLATFORM_DOMAINS: Record<SocialPlatform, string> = {
  INSTAGRAM: "instagram.com",
  FACEBOOK: "facebook.com",
  TIKTOK: "tiktok.com",
  YOUTUBE: "youtube.com",
};

/**
 * Automatic search only accepts profile URLs, so target profile-shaped paths
 * up front on platforms whose indexes are dominated by individual posts or
 * videos. This leaves fewer unusable hits for the result normalizer to discard.
 */
const PLATFORM_PROFILE_SITE_SCOPES: Record<SocialPlatform, string[]> = {
  INSTAGRAM: ["site:instagram.com"],
  FACEBOOK: ["site:facebook.com"],
  TIKTOK: ["site:tiktok.com/@"],
  YOUTUBE: [
    "site:youtube.com/@",
    "site:youtube.com/channel/",
    "site:youtube.com/c/",
    "site:youtube.com/user/",
  ],
};

const PLATFORM_CREATOR_TERMS: Record<SocialPlatform, string> = {
  INSTAGRAM: '("Instagram creator" OR influencer OR blogger)',
  FACEBOOK: '("Facebook creator" OR "content creator" OR blogger)',
  TIKTOK: '("TikTok creator" OR TikToker OR influencer)',
  YOUTUBE: '(YouTuber OR "YouTube creator" OR vlogger)',
};

const PROFILE_SEARCH_BIAS: Record<SocialPlatform, string> = {
  INSTAGRAM: "-inurl:/p/ -inurl:/reel/ -inurl:/stories/ -inurl:/explore/ -inurl:/tv/",
  FACEBOOK: "-inurl:/posts/ -inurl:/reel/ -inurl:/watch/ -inurl:/videos/ -inurl:/photos/",
  TIKTOK: "-inurl:/video/ -inurl:/tag/ -inurl:/music/ -inurl:/discover/ -inurl:/embed/",
  YOUTUBE: "-inurl:/watch -inurl:/shorts/ -inurl:/playlist -inurl:/embed/ -inurl:/results",
};

const CATEGORY_SEARCH_EXPANSIONS: Record<string, string[]> = {
  "art & design": [
    '("art creator" OR artist OR illustrator OR designer)',
    '("digital art" OR "graphic design" OR "visual artist" OR "art page")',
    '("creative studio" OR "design creator" OR "art content creator")',
  ],
  automotive: [
    '(automotive OR cars OR motoring OR "car enthusiast")',
    '("car content" OR "auto review" OR "car spotting" OR motorcycle)',
    '("car creator" OR "motoring content creator" OR "auto influencer")',
  ],
  beauty: [
    '(beauty OR makeup OR skincare OR cosmetics)',
    '("makeup artist" OR MUA OR "beauty blogger" OR "skin care")',
    '("beauty creator" OR "makeup creator" OR "skincare content creator")',
  ],
  education: [
    '(education OR teacher OR tutor OR learning)',
    '("study tips" OR "educational content" OR "online learning" OR student)',
    '("education creator" OR "teacher creator" OR "learning content creator")',
  ],
  entertainment: [
    '(entertainment OR comedy OR actor OR celebrity)',
    '("funny videos" OR comedian OR "showbiz" OR "pop culture")',
    '("entertainment creator" OR "comedy creator" OR "content creator")',
  ],
  fashion: [
    '(fashion OR style OR outfit OR OOTD)',
    '("fashion blogger" OR stylist OR streetwear OR "personal style")',
    '("fashion creator" OR "style creator" OR "outfit content creator")',
  ],
  finance: [
    '(finance OR investing OR business OR money)',
    '("personal finance" OR "financial literacy" OR stocks OR crypto)',
    '("finance creator" OR "business creator" OR "money content creator")',
  ],
  fitness: [
    '(fitness OR workout OR gym OR trainer)',
    '("personal trainer" OR "fitness coach" OR yoga OR running)',
    '("fitness creator" OR "workout creator" OR "health content creator")',
  ],
  food: [
    '(food OR restaurant OR foodie OR eats)',
    '("food blogger" OR "food review" OR "restaurant review" OR cafe)',
    '("food creator" OR "food content creator" OR "restaurant content creator")',
  ],
  gaming: [
    "(gaming OR gamer OR streamer OR esports)",
    '("Mobile Legends" OR MLBB OR Valorant OR Roblox OR "game streamer" OR "Facebook Gaming")',
    '("game streamer" OR "gaming content creator" OR "Facebook Gaming")',
  ],
  "health & wellness": [
    '("health and wellness" OR wellness OR health OR nutrition)',
    '("mental health" OR "self care" OR dietitian OR mindfulness)',
    '("wellness creator" OR "health creator" OR "wellness content creator")',
  ],
  "home & living": [
    '("home and living" OR home OR interiors OR decor)',
    '("home decor" OR "interior design" OR furniture OR renovation)',
    '("home creator" OR "interior creator" OR "living content creator")',
  ],
  lifestyle: [
    '(lifestyle OR vlog OR daily OR "life in")',
    '("lifestyle blogger" OR "daily vlog" OR "personal blog" OR "content creator")',
    '("lifestyle creator" OR "vlogger" OR "influencer")',
  ],
  music: [
    '(music OR musician OR singer OR band)',
    '("music artist" OR DJ OR rapper OR songwriter)',
    '("music creator" OR "musician creator" OR "music content creator")',
  ],
  parenting: [
    '(parenting OR mom OR dad OR family)',
    '("mom blogger" OR motherhood OR fatherhood OR kids)',
    '("parenting creator" OR "family creator" OR "parent content creator")',
  ],
  pets: [
    '(pets OR dog OR cat OR pet)',
    '("pet care" OR "dog lover" OR "cat lover" OR veterinarian)',
    '("pet creator" OR "pet content creator" OR "animal content creator")',
  ],
  photography: [
    '(photography OR photographer OR photo OR camera)',
    '("portrait photographer" OR "street photography" OR videographer OR "photo studio")',
    '("photography creator" OR "photo creator" OR "visual content creator")',
  ],
  sports: [
    '(sports OR athlete OR basketball OR volleyball)',
    '(football OR running OR cycling OR boxing OR martial arts)',
    '("sports creator" OR "athlete creator" OR "sports content creator")',
  ],
  technology: [
    '(technology OR tech OR gadget OR apps)',
    '("tech review" OR "gadget review" OR smartphone OR laptop)',
    '("tech creator" OR "technology content creator" OR "gadget creator")',
  ],
  travel: [
    '(travel OR traveler OR destination OR trips)',
    '("travel blogger" OR "travel guide" OR hotel OR resort)',
    '("travel creator" OR "travel content creator" OR "local guide")',
  ],
};

const CATEGORY_RELEVANCE_TERMS: Record<string, string[]> = {
  "art & design": [
    "art",
    "artist",
    "illustrator",
    "illustration",
    "designer",
    "design",
    "digital art",
    "graphic",
    "creative",
    "visual",
  ],
  automotive: [
    "automotive",
    "auto",
    "car",
    "cars",
    "motoring",
    "motorcycle",
    "bike",
    "driver",
    "vehicle",
  ],
  beauty: [
    "beauty",
    "makeup",
    "mua",
    "skincare",
    "skin care",
    "cosmetics",
    "glam",
    "hair",
  ],
  education: [
    "education",
    "teacher",
    "tutor",
    "student",
    "study",
    "learning",
    "school",
    "tips",
  ],
  entertainment: [
    "entertainment",
    "comedy",
    "comedian",
    "funny",
    "actor",
    "actress",
    "showbiz",
    "celebrity",
    "pop culture",
  ],
  fashion: [
    "fashion",
    "style",
    "outfit",
    "ootd",
    "stylist",
    "streetwear",
    "wardrobe",
    "clothing",
  ],
  finance: [
    "finance",
    "money",
    "investing",
    "investment",
    "stocks",
    "crypto",
    "business",
    "financial",
    "budget",
  ],
  fitness: [
    "fitness",
    "workout",
    "gym",
    "trainer",
    "coach",
    "yoga",
    "running",
    "exercise",
    "fit",
  ],
  food: [
    "food",
    "foodie",
    "restaurant",
    "eats",
    "cafe",
    "recipe",
    "cooking",
    "chef",
    "dining",
  ],
  gaming: [
    "gaming",
    "gamer",
    "game",
    "streamer",
    "stream",
    "shoutcaster",
    "caster",
    "tournament",
    "esports",
    "esport",
    "mobile legends",
    "mlbb",
    "valorant",
    "roblox",
    "pubg",
    "codm",
    "call of duty",
    "genshin",
    "twitch",
    "facebook gaming",
  ],
  "health & wellness": [
    "health",
    "wellness",
    "nutrition",
    "mental health",
    "self care",
    "mindfulness",
    "diet",
    "healthy",
  ],
  "home & living": [
    "home",
    "living",
    "interior",
    "decor",
    "furniture",
    "renovation",
    "house",
    "condo",
  ],
  lifestyle: [
    "lifestyle",
    "life",
    "vlog",
    "daily",
    "blog",
    "creator",
    "influencer",
  ],
  music: [
    "music",
    "musician",
    "singer",
    "song",
    "band",
    "dj",
    "rapper",
    "artist",
    "songwriter",
  ],
  parenting: [
    "parenting",
    "parent",
    "mom",
    "motherhood",
    "dad",
    "fatherhood",
    "family",
    "kids",
    "baby",
  ],
  pets: [
    "pet",
    "pets",
    "dog",
    "cat",
    "puppy",
    "kitten",
    "veterinarian",
    "animal",
  ],
  photography: [
    "photography",
    "photographer",
    "photo",
    "camera",
    "portrait",
    "videographer",
    "studio",
    "visual",
  ],
  sports: [
    "sports",
    "sport",
    "athlete",
    "basketball",
    "volleyball",
    "football",
    "running",
    "cycling",
    "boxing",
  ],
  technology: [
    "technology",
    "tech",
    "gadget",
    "app",
    "apps",
    "smartphone",
    "laptop",
    "review",
    "digital",
  ],
  travel: [
    "travel",
    "traveler",
    "trip",
    "destination",
    "hotel",
    "resort",
    "guide",
    "tour",
  ],
};

const CATEGORY_STRONG_RELEVANCE_TERMS: Record<string, string[]> = {
  "art & design": ["artist", "illustrator", "designer", "digital art", "graphic design"],
  automotive: ["automotive", "car", "cars", "motoring", "motorcycle"],
  beauty: ["beauty", "makeup", "mua", "skincare", "cosmetics"],
  education: ["education", "teacher", "tutor", "learning", "study tips"],
  entertainment: ["entertainment", "comedy", "comedian", "actor", "showbiz"],
  fashion: ["fashion", "style", "outfit", "ootd", "streetwear"],
  finance: ["finance", "investing", "stocks", "crypto", "financial"],
  fitness: ["fitness", "workout", "gym", "trainer", "coach"],
  food: ["food", "foodie", "restaurant", "cafe", "chef"],
  gaming: [
    "gaming",
    "gamer",
    "streamer",
    "shoutcaster",
    "caster",
    "tournament",
    "esports",
    "mobile legends",
    "mlbb",
    "valorant",
    "roblox",
    "pubg",
    "codm",
    "call of duty",
    "genshin",
    "twitch",
  ],
  "health & wellness": ["wellness", "nutrition", "mental health", "self care", "mindfulness"],
  "home & living": ["home decor", "interior", "furniture", "renovation"],
  lifestyle: ["lifestyle", "vlog", "daily vlog", "blogger", "influencer"],
  music: ["music", "musician", "singer", "band", "dj", "rapper"],
  parenting: ["parenting", "mom", "motherhood", "dad", "family"],
  pets: ["pet", "pets", "dog", "cat", "veterinarian"],
  photography: ["photography", "photographer", "camera", "portrait", "videographer"],
  sports: ["sports", "athlete", "basketball", "volleyball", "football", "boxing"],
  technology: ["technology", "tech", "gadget", "smartphone", "laptop"],
  travel: ["travel", "traveler", "hotel", "resort", "local guide"],
};

const BLOCKED_CATEGORY_PROFILE_HANDLES: Record<string, string[]> = {
  gaming: ["facebookgaming", "gaming", "instagramgaming", "influencerscommunity"],
};

function quoteSearchTerm(value: string): string {
  const normalized = value.replace(/["()]/g, " ").replace(/\s+/g, " ").trim();
  return normalized.includes(" ") ? `"${normalized}"` : normalized;
}

/** Join values into a single term, or an OR group when there is more than one. */
function orGroup(values: string[]): string {
  const terms = values.map(quoteSearchTerm).filter(Boolean);
  if (terms.length === 0) return "";
  if (terms.length === 1) return terms[0];
  return `(${terms.join(" OR ")})`;
}

export function buildDiscoveryQuery(input: DiscoverySearchInput): string {
  const parts: string[] = [];
  if (input.keywords) parts.push(quoteSearchTerm(input.keywords));

  const categoryGroup = orGroup(input.categories);
  parts.push(categoryGroup ? `${categoryGroup} creator influencer` : "creator influencer");

  const locationGroup = orGroup(input.locations);
  if (locationGroup) parts.push(locationGroup);

  const sites = input.channels.map((channel) => `site:${PLATFORM_DOMAINS[channel]}`).join(" OR ");
  return `${parts.join(" ")} (${sites})`;
}

function withProfileSearchBias(query: string, channels: SocialPlatform[]): string {
  const bias = channels.map((channel) => PROFILE_SEARCH_BIAS[channel]).join(" ");
  return `${query} ${bias}`.trim();
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizedKey(value: string): string {
  return value.trim().toLowerCase();
}

function categorySearchTerms(category: string): string[] {
  const expanded = CATEGORY_SEARCH_EXPANSIONS[normalizedKey(category)] ?? [];
  return [quoteSearchTerm(category), ...expanded].slice(0, 3);
}

function locationSearchTerms(location: string): string[] {
  const normalized = normalizedKey(location);
  if (normalized === "metro manila" || normalized === "all metro manila") {
    return [
      '("Metro Manila" OR NCR OR "Manila Philippines")',
      '("Caloocan" OR "Las Piñas" OR Makati OR Malabon OR Mandaluyong OR Manila OR Marikina OR Muntinlupa OR Navotas OR Parañaque OR Pasay OR Pasig OR Pateros OR "Quezon City" OR "San Juan" OR Taguig OR Valenzuela)',
      '("Quezon City" OR Makati OR Taguig OR Pasig OR Mandaluyong)',
      '(Manila OR Pasay OR "Las Piñas" OR Parañaque OR Muntinlupa OR Caloocan OR Marikina OR Malabon OR Navotas OR Pateros OR "San Juan" OR Valenzuela)',
    ];
  }
  return [quoteSearchTerm(location)];
}

function buildFocusedDiscoveryQuery({
  keywords,
  categoryTerm,
  locationTerm,
  channels,
}: {
  keywords: string;
  categoryTerm: string;
  locationTerm: string;
  channels: SocialPlatform[];
}): string {
  const parts: string[] = [];
  if (keywords) parts.push(quoteSearchTerm(keywords));
  const creatorTerms = uniqueValues(channels.map((channel) => PLATFORM_CREATOR_TERMS[channel]));
  const creatorGroup = creatorTerms.length === 1 ? creatorTerms[0] : `(${creatorTerms.join(" OR ")})`;
  parts.push(
    categoryTerm
      ? `${categoryTerm} ${creatorGroup} content creator`
      : `${creatorGroup} content creator`,
  );
  if (locationTerm) parts.push(locationTerm);

  const sites = uniqueValues(
    channels.flatMap((channel) => PLATFORM_PROFILE_SITE_SCOPES[channel]),
  ).join(" OR ");
  return `${parts.join(" ")} (${sites})`;
}

type DiscoverySearchPlan = {
  query: string;
  channels: SocialPlatform[];
  categories: string[];
};

/**
 * Build focused provider queries for automatic discovery.
 *
 * A single OR-heavy query is cheap, but web search often spends the page on
 * articles or one dominant topic. These focused queries give each selected
 * channel/category/location a fair chance, while the provider layer still
 * dedupes and stops once the requested result limit is reached.
 */
export function buildDiscoverySearchQueries(
  input: DiscoverySearchInput,
  maxQueries = 12,
): string[] {
  return buildDiscoverySearchPlans(input, maxQueries).map((plan) => plan.query);
}

export function buildDiscoverySearchPlans(
  input: DiscoverySearchInput,
  maxQueries = 12,
): DiscoverySearchPlan[] {
  const categories = uniqueValues(input.categories);
  const locations = uniqueValues(input.locations);
  const categoryVariants =
    categories.length > 0
      ? categories.map((category) => ({
          original: category,
          terms: categorySearchTerms(category),
        }))
      : [{ original: "", term: "" }];
  const shouldBroadenLocation = categories.length <= 2 && locations.length <= 1;
  const locationVariants =
    locations.length > 0
      ? locations.flatMap((location) =>
          shouldBroadenLocation ? locationSearchTerms(location) : [quoteSearchTerm(location)],
        )
      : [""];
  const plans: DiscoverySearchPlan[] = [];
  const seen = new Set<string>();

  function addPlan(planInput: {
    channel: SocialPlatform;
    category: { original: string; term: string };
    locationTerm: string;
  }) {
    if (plans.length >= maxQueries) return;
    const query = withProfileSearchBias(
      buildFocusedDiscoveryQuery({
        keywords: input.keywords,
        categoryTerm: planInput.category.term,
        locationTerm: planInput.locationTerm,
        channels: [planInput.channel],
      }),
      [planInput.channel],
    );
    if (seen.has(query)) return;
    seen.add(query);
    plans.push({
      query,
      channels: [planInput.channel],
      categories: planInput.category.original ? [planInput.category.original] : [],
    });
  }

  const maxTermCount = Math.max(
    ...categoryVariants.map((category) => ("terms" in category ? category.terms.length : 1)),
  );

  for (const locationTerm of locationVariants) {
    for (let termIndex = 0; termIndex < maxTermCount; termIndex += 1) {
      for (const category of categoryVariants) {
        const term = "terms" in category ? category.terms[termIndex] : category.term;
        if (term === undefined) continue;
        for (const channel of input.channels) {
          addPlan({
            channel,
            category: { original: category.original, term },
            locationTerm,
          });
        }
      }
    }
  }

  if (plans.length === 0) {
    for (const channel of input.channels) {
      addPlan({ channel, category: { original: "", term: "" }, locationTerm: "" });
    }
  }

  return plans;
}

export function filterDiscoveryWebResults(
  webResults: WebSearchResult[],
  categories: string[],
): WebSearchResult[] {
  const relevanceTerms = uniqueValues(
    categories.flatMap((category) => CATEGORY_RELEVANCE_TERMS[normalizedKey(category)] ?? []),
  );
  if (relevanceTerms.length === 0) return webResults;

  return webResults
    .map((result, index) => ({
      result,
      index,
      score: scoreDiscoveryWebResult(result, categories, relevanceTerms),
    }))
    .filter((entry) => entry.score >= 2)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.result);
}

function scoreDiscoveryWebResult(
  result: WebSearchResult,
  categories: string[],
  relevanceTerms: string[],
): number {
  const title = result.title ?? "";
  const description = result.description ?? "";
  const url = result.url ?? "";
  const searchable = `${title} ${description} ${url}`.toLowerCase();
  const titleAndHandle = `${title} ${url}`.toLowerCase();
  const normalized = normalizeProfileUrl(url);

  if (normalized.ok) {
    const handle = normalized.usernameHint?.toLowerCase() ?? "";
    const blockedHandles = categories.flatMap(
      (category) => BLOCKED_CATEGORY_PROFILE_HANDLES[normalizedKey(category)] ?? [],
    );
    if (blockedHandles.includes(handle)) return 0;
  }

  const strongTerms = uniqueValues(
    categories.flatMap((category) => CATEGORY_STRONG_RELEVANCE_TERMS[normalizedKey(category)] ?? []),
  );
  let score = 0;

  for (const term of relevanceTerms) {
    if (!searchable.includes(term)) continue;
    score += titleAndHandle.includes(term) ? 2 : 1;
  }

  if (strongTerms.some((term) => titleAndHandle.includes(term))) score += 2;
  else if (strongTerms.some((term) => searchable.includes(term))) score += 1;

  if (/\b(creator|content creator|blogger|vlogger|influencer|reviewer|host|coach|artist)\b/i.test(searchable)) {
    score += 1;
  }

  if (/\b(community|summit|official|directory|platform|family)\b/i.test(titleAndHandle)) {
    score -= 2;
  }

  return score;
}

export function buildManualSearchUrl(
  input: DiscoverySearchInput,
  channel: SocialPlatform,
): string {
  const query = buildDiscoveryQuery({ ...input, channels: [channel] });
  const url = new URL("https://www.google.com/search");
  url.searchParams.set("q", withProfileSearchBias(query, [channel]));
  return url.toString();
}

export function extractProfileUrlsFromText(text: string): string[] {
  const matches =
    text.match(
      /(?:https?:\/\/)?(?:www\.|m\.|web\.)?(?:instagram\.com|instagr\.am|facebook\.com|fb\.com|fb\.me|tiktok\.com|youtube\.com|youtu\.be)\/[^\s<>"'`]+/gi,
    ) ?? [];
  const profiles: string[] = [];
  const seen = new Set<string>();

  for (const match of matches) {
    const candidate = match.replace(/[),.;\]}]+$/, "");
    const normalized = normalizeProfileUrl(candidate);
    if (!normalized.ok) continue;
    const key = `${normalized.platform}:${normalized.normalizedUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    profiles.push(normalized.canonicalUrl);
  }

  return profiles;
}

function plainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function displayNameFromResult(title: string, username: string | null): string {
  const cleaned = plainText(title)
    .replace(/\s*[|·•-]\s*(Instagram|Facebook|TikTok|YouTube).*$/i, "")
    .replace(/\s*\(@[^)]+\).*$/i, "")
    .trim();
  if (cleaned && !/^(instagram|facebook|tiktok|youtube)$/i.test(cleaned)) {
    return cleaned.slice(0, 200);
  }
  return username ? `@${username}` : "Discovered creator";
}

export function normalizeDiscoveryResults(
  webResults: WebSearchResult[],
  channels: SocialPlatform[],
  limit: number,
): Omit<DiscoveryResult, "existingInfluencer">[] {
  const output: Omit<DiscoveryResult, "existingInfluencer">[] = [];
  const seen = new Set<string>();

  for (const result of webResults) {
    if (!result.url) continue;
    let normalized: ReturnType<typeof normalizeProfileUrl> | null = null;
    for (const channel of channels) {
      const candidate = normalizeProfileUrl(result.url, channel);
      if (candidate.ok && candidate.platform === channel) {
        normalized = candidate;
        break;
      }
    }
    if (!normalized?.ok) continue;

    const key = `${normalized.platform}:${normalized.normalizedUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const title = plainText(result.title ?? "");
    output.push({
      platform: normalized.platform,
      profileUrl: normalized.canonicalUrl,
      normalizedUrl: normalized.normalizedUrl,
      username: normalized.usernameHint,
      displayName: displayNameFromResult(title, normalized.usernameHint),
      title,
      description: plainText(result.description ?? "").slice(0, 500),
    });
    if (output.length >= limit) break;
  }

  return output;
}

export function parseManualProfileUrls(
  text: string,
  limit: number,
  allowedChannels?: SocialPlatform[],
): {
  profiles: ManualProfileCandidate[];
  errors: { input: string; message: string }[];
} {
  const profiles: ManualProfileCandidate[] = [];
  const errors: { input: string; message: string }[] = [];
  const seen = new Set<string>();
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*]\s+/, ""))
    .filter(Boolean);

  for (const line of lines) {
    if (profiles.length >= limit) {
      errors.push({
        input: line,
        message: `Not included because this search is limited to ${limit} profiles.`,
      });
      continue;
    }

    const normalized = normalizeProfileUrl(line);
    if (!normalized.ok) {
      errors.push({ input: line, message: normalized.message });
      continue;
    }
    if (allowedChannels && !allowedChannels.includes(normalized.platform)) {
      errors.push({
        input: line,
        message: "This profile is not on one of the selected channels.",
      });
      continue;
    }
    const key = `${normalized.platform}:${normalized.normalizedUrl}`;
    if (seen.has(key)) {
      errors.push({ input: line, message: "Duplicate profile URL." });
      continue;
    }
    seen.add(key);
    profiles.push({
      platform: normalized.platform,
      profileUrl: normalized.canonicalUrl,
      normalizedUrl: normalized.normalizedUrl,
      displayName: normalized.usernameHint
        ? `@${normalized.usernameHint}`
        : "Discovered creator",
    });
  }

  return { profiles, errors };
}

export function socialPlatformLabel(platform: SocialPlatform): string {
  return SOCIAL_PLATFORM_LABELS[platform];
}
