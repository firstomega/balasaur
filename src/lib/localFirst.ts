import { originsForCountry } from "@/lib/origins";

/** The origin bucket(s) to rank first for a viewer's country (empty if unbucketed).
 *  Applied silently on the default view — prioritizes home-country titles without
 *  hiding anything; an explicit sort or Origin filter always wins. */
export function boostBucketsForCountry(country: string): string[] {
  return originsForCountry(country);
}
