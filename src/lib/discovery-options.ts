/**
 * Fixed option lists for the Creator discovery filters.
 *
 * These are plain constants (no server-only) so both the server page and the
 * client workspace can import them. Categories are merged with any custom
 * categories already present in the influencer database; locations are scoped to
 * Metro Manila for now (the umbrella term plus its cities).
 */

/** Metro Manila cities — the current geographic scope for creator discovery. */
export const METRO_MANILA_CITIES = [
  "Caloocan",
  "Las Piñas",
  "Makati",
  "Malabon",
  "Mandaluyong",
  "Manila",
  "Marikina",
  "Muntinlupa",
  "Navotas",
  "Parañaque",
  "Pasay",
  "Pasig",
  "Pateros",
  "Quezon City",
  "San Juan",
  "Taguig",
  "Valenzuela",
] as const;

/** Location options: the umbrella term first, then each city. */
export const DISCOVERY_LOCATIONS = ["Metro Manila", ...METRO_MANILA_CITIES] as const;

/** Common creator niches offered as discovery category filters. */
export const DISCOVERY_CATEGORIES = [
  "Beauty",
  "Fashion",
  "Food",
  "Fitness",
  "Travel",
  "Lifestyle",
  "Technology",
  "Gaming",
  "Parenting",
  "Finance",
  "Health & Wellness",
  "Entertainment",
  "Education",
  "Home & Living",
  "Automotive",
  "Sports",
  "Photography",
  "Art & Design",
  "Music",
  "Pets",
] as const;

/** Merge the canonical categories with database-derived ones, de-duped and sorted. */
export function mergeCategoryOptions(fromDatabase: string[]): string[] {
  const set = new Set<string>(DISCOVERY_CATEGORIES);
  for (const value of fromDatabase) {
    const trimmed = value.trim();
    if (trimmed) set.add(trimmed);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}
