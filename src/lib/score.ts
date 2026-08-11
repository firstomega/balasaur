// The Balasaur Score blend, computed from whatever external scores a title has.
// Mirrors the weights we'll use once Balasaur user ratings exist
//   user 0.50 · IMDb 0.25 · Rotten Tomatoes 0.125 · Metacritic 0.125 · TMDB 0.10
// renormalized over the scores actually present (so a title with only IMDb still
// gets a score). TMDB carries the smallest weight — it's an audience score with
// looser standards — but its presence on nearly every title means almost every
// card can show ONE score format instead of falling back to a raw "★ 7.0".
// Computed in-app from the ratings we already load — no stored column needed, so
// the homepage never depends on a not-yet-applied migration. The stored
// `rating_balasaur` GENERATED column (used for SQL-side sorting) mirrors these
// exact weights — change both together or sort order and badges will disagree.
export function computeBalasaurScore(s: {
  imdb?: number | null;
  rottenTomatoes?: number | null;
  metacritic?: number | null;
  tmdb?: number | null;
  userAvg?: number | null;
}): number | undefined {
  const parts: Array<[number, number]> = []; // [value 0–100, weight]
  if (s.userAvg != null) parts.push([s.userAvg, 0.5]);
  if (s.imdb != null) parts.push([s.imdb * 10, 0.25]);
  if (s.rottenTomatoes != null) parts.push([s.rottenTomatoes, 0.125]);
  if (s.metacritic != null) parts.push([s.metacritic, 0.125]);
  if (s.tmdb != null) parts.push([s.tmdb * 10, 0.1]);
  if (parts.length === 0) return undefined;
  const num = parts.reduce((acc, [v, w]) => acc + v * w, 0);
  const den = parts.reduce((acc, [, w]) => acc + w, 0);
  return Math.round(num / den);
}
