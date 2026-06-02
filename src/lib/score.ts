// The Balasaur Score blend, computed from whatever external scores a title has.
// Mirrors the weights we'll use once Balasaur user ratings exist
//   user 0.50 · IMDb 0.25 · Rotten Tomatoes 0.125 · Metacritic 0.125
// renormalized over the scores actually present (so a title with only IMDb still
// gets a score). Computed in-app from the IMDb/RT/MC we already load — no stored
// column needed, so the homepage never depends on a not-yet-applied migration.
export function computeBalasaurScore(s: {
  imdb?: number | null;
  rottenTomatoes?: number | null;
  metacritic?: number | null;
  userAvg?: number | null;
}): number | undefined {
  const parts: Array<[number, number]> = []; // [value 0–100, weight]
  if (s.userAvg != null) parts.push([s.userAvg, 0.5]);
  if (s.imdb != null) parts.push([s.imdb * 10, 0.25]);
  if (s.rottenTomatoes != null) parts.push([s.rottenTomatoes, 0.125]);
  if (s.metacritic != null) parts.push([s.metacritic, 0.125]);
  if (parts.length === 0) return undefined;
  const num = parts.reduce((acc, [v, w]) => acc + v * w, 0);
  const den = parts.reduce((acc, [, w]) => acc + w, 0);
  return Math.round(num / den);
}
