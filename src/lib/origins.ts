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
 * Map a *viewer's* ISO-3166-1 country code (from IP geo or their account region) to
 * the origin bucket(s) that represent "titles from their country", used to rank
 * home-country titles first on the default homepage. Returns [] for countries we
 * don't bucket (e.g. DE, BR) — those viewers just get the normal popularity order.
 * This is intentionally the same bucket vocabulary the Origin filter uses, so a US
 * viewer's boost ("American") lines up exactly with what the filter would select.
 */
export function originsForCountry(country: string | null | undefined): string[] {
  const cc = (country ?? "").toUpperCase();
  if (!cc) return [];
  return ORIGIN_BUCKETS.filter((b) => b.countries.includes(cc)).map((b) => b.key);
}

/**
 * Map a title to origin bucket key(s), LANGUAGE-FIRST.
 *
 * A distinctive original language (Korean, Japanese, Chinese, Indian languages,
 * Spanish, French) resolves to a single bucket and wins over production country.
 * This is the fix for co-productions: "Miraculous" is French-language but
 * co-produced in South Korea, so the old "language OR any country" rule tagged it
 * both French AND Korean. Language is the honest cultural signal (it's what the
 * facts table shows), so we trust it and ignore co-pro countries.
 *
 * English / non-distinctive languages can't tell US from UK, so they fall back to
 * production country — but only for the language-agnostic buckets (American /
 * British), so a co-pro country can never pull in a language bucket. Returns []
 * when nothing recognizable matches — those titles are simply never excluded.
 */
export function deriveOrigins(
  originLanguage: string | null | undefined,
  originCountries: string[] | null | undefined,
): string[] {
  const lang = (originLanguage ?? "").toLowerCase();
  const countries = new Set((originCountries ?? []).map((c) => c.toUpperCase()));

  // 1. Distinctive original language → that single bucket, country ignored.
  for (const b of ORIGIN_BUCKETS) {
    if (b.langs.length > 0 && b.langs.includes(lang)) return [b.key];
  }

  // 2. English / undistinctive → production country, but only the language-agnostic
  //    buckets (American / British) to avoid co-pro mislabeling.
  const out: string[] = [];
  for (const b of ORIGIN_BUCKETS) {
    if (b.langs.length === 0 && b.countries.some((c) => countries.has(c))) {
      out.push(b.key);
    }
  }
  return out;
}
