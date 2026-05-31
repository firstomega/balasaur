// Curated "Origin" facet (Model D): a small set of recognizable buckets, each
// matched from a title's original language and/or production countries. This is
// the geographic/cultural axis — K-drama, anime's home, Bollywood, etc. — kept
// orthogonal to Genre so e.g. "Korean ∩ Thriller" is just an intersection.

interface OriginBucket {
  key: string; // display label + filter value
  langs: string[]; // ISO 639-1 original_language codes
  countries: string[]; // ISO 3166-1 production-country codes
}

// Order = display order in the rail.
const ORIGIN_BUCKETS: OriginBucket[] = [
  { key: "Korean", langs: ["ko"], countries: ["KR"] },
  { key: "Japanese", langs: ["ja"], countries: ["JP"] },
  { key: "Chinese", langs: ["zh", "cn"], countries: ["CN", "TW", "HK"] },
  { key: "Indian", langs: ["hi", "ta", "te", "ml", "kn", "bn", "mr", "pa"], countries: ["IN"] },
  { key: "Spanish", langs: ["es"], countries: ["ES", "MX", "AR", "CO", "CL", "PE"] },
  { key: "French", langs: ["fr"], countries: ["FR", "BE"] },
  { key: "British", langs: [], countries: ["GB"] },
  { key: "American", langs: [], countries: ["US"] },
];

export const ORIGIN_OPTIONS = ORIGIN_BUCKETS.map((b) => b.key);

/**
 * Map a title's original language + production countries to origin bucket keys.
 * A title can match several (e.g. a UK/US co-production). Returns [] when nothing
 * recognizable matches — those titles are simply never excluded by the filter.
 */
export function deriveOrigins(
  originLanguage: string | null | undefined,
  originCountries: string[] | null | undefined,
): string[] {
  const lang = (originLanguage ?? "").toLowerCase();
  const countries = new Set((originCountries ?? []).map((c) => c.toUpperCase()));
  const out: string[] = [];
  for (const b of ORIGIN_BUCKETS) {
    if (b.langs.includes(lang) || b.countries.some((c) => countries.has(c))) {
      out.push(b.key);
    }
  }
  return out;
}
