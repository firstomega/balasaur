import { originsForCountry } from "@/lib/origins";

// Friendly flag + adjective for each origin bucket, for the "local-first" banner.
const BUCKET_DISPLAY: Record<string, { flag: string; label: string }> = {
  American: { flag: "🇺🇸", label: "American" },
  British: { flag: "🇬🇧", label: "British" },
  Korean: { flag: "🇰🇷", label: "Korean" },
  Japanese: { flag: "🇯🇵", label: "Japanese" },
  Chinese: { flag: "🇨🇳", label: "Chinese" },
  Indian: { flag: "🇮🇳", label: "Indian" },
  Spanish: { flag: "🇪🇸", label: "Spanish" },
  French: { flag: "🇫🇷", label: "French" },
};

/** The origin bucket(s) to rank first for a viewer's country (empty if unbucketed). */
export function boostBucketsForCountry(country: string): string[] {
  return originsForCountry(country);
}

/** Short label for the local-first banner, e.g. "🇰🇷 Korean". Null when the viewer's
 *  country maps to no bucket (so there's nothing to boost and no banner to show). */
export function localFirstLabel(country: string): string | null {
  const bucket = originsForCountry(country)[0];
  if (!bucket) return null;
  const d = BUCKET_DISPLAY[bucket];
  return d ? `${d.flag} ${d.label}` : bucket;
}

export const LOCAL_FIRST_KEY = "balasaur:local-first";
