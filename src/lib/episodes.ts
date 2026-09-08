/**
 * Per-episode ratings: the shapes the heatmap draws from, the sentence under
 * it, and the gate that decides whether a show gets one at all.
 *
 * Everything here is pure. The rules that matter (what counts as covered, what
 * the peak sentence claims) are the kind of thing that has to be checkable
 * without a database in front of you.
 */

/** One rated episode. An episode nobody rated is absent, never a zero. */
export interface EpisodeRating {
  season: number;
  episode: number;
  /** TMDB vote average, 0.1 to 10. */
  rating: number;
  votes: number;
  /** ISO date, or null when TMDB has no air date for it. */
  airDate: string | null;
  name: string | null;
}

/** A season as `media.seasons` stores it: how many episodes it is meant to have. */
export interface SeasonSize {
  seasonNumber: number;
  episodeCount: number;
}

export interface SeasonSummary {
  season: number;
  /** Mean of the ratings in `episodes`, to one decimal. */
  average: number;
  /** Episodes with a rating. This is exactly the number of cells drawn. */
  rated: number;
  /** Episodes the season is meant to have, from `media.seasons`. */
  expected: number;
  episodes: EpisodeRating[];
}

export interface EpisodeHeatmap {
  seasons: SeasonSummary[];
  /** Rated episodes across the whole show. */
  rated: number;
  /** Episodes the show is meant to have. */
  expected: number;
  /** rated / expected, 0 to 1. */
  coverage: number;
  peak: SeasonSummary;
  trough: SeasonSummary;
  /** The line under the grid. Empty string is never returned. */
  sentence: string;
  /** Episodes in the longest column, so a grid can size its rows once. */
  longestSeason: number;
  /** The ramp this show's cells are coloured against. */
  scale: RatingScale;
}

/** A show below either of these gets no heatmap. A partial grid is a lie. */
export const EPISODE_COVERAGE_MIN = 0.6;
export const EPISODE_SEASONS_MIN = 2;

/** Steps in the colour ramp. Seven is what fits a legend strip and still puts
 *  a visible gap between a 7.4 and an 8.1 on a show whose episodes live there. */
export const RAMP_STEPS = 7;

/**
 * The narrowest window the ramp will stretch across, in rating points.
 *
 * Without it, a show whose episodes all sit between 9.2 and 9.5 would paint
 * the 9.2s the same dark red as the worst episode of anything, which is a lie
 * told by arithmetic. Two points is wide enough that a show that really is
 * uniform reads as uniform.
 */
export const RAMP_MIN_SPREAD = 2;

/** The rating at each end of the ramp for one show. Both are printed. */
export interface RatingScale {
  /** Bottom of the ramp. Anything at or under it takes the darkest step. */
  lo: number;
  /** Top of the ramp. Anything at or over it takes the brightest step. */
  hi: number;
}

/** Linear-interpolated quantile of an ascending list. */
function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const i = Math.floor(pos);
  const next = sorted[i + 1];
  return next === undefined ? sorted[i] : sorted[i] + (next - sorted[i]) * (pos - i);
}

/**
 * The ramp for one show, from its own episodes rather than from an absolute
 * 0 to 10. A drama that lives between 7.2 and 9.4 spends the whole ramp on
 * that band, so its best season is visibly its best season.
 *
 * The ends are the 5th and 95th percentile, not the min and max: one
 * review-bombed finale would otherwise take the bottom of the ramp for itself
 * and flatten everything above it. Episodes outside the window take the end
 * step, so nothing is hidden, and both ends are printed under the legend.
 */
export function ratingScale(ratings: number[]): RatingScale {
  const sorted = ratings.filter((r) => Number.isFinite(r)).sort((a, b) => a - b);
  if (sorted.length === 0) return { lo: 0, hi: 10 };

  let lo = quantile(sorted, 0.05);
  let hi = quantile(sorted, 0.95);
  if (hi - lo < RAMP_MIN_SPREAD) {
    const mid = (lo + hi) / 2;
    lo = mid - RAMP_MIN_SPREAD / 2;
    hi = mid + RAMP_MIN_SPREAD / 2;
  }
  // Ratings are 0 to 10. Slide the window back inside rather than squashing it,
  // so a show of 9.8s keeps a full-width ramp instead of a one-colour block.
  if (hi > 10) {
    lo -= hi - 10;
    hi = 10;
  }
  if (lo < 0) {
    hi = Math.min(10, hi - lo);
    lo = 0;
  }
  // Round to the decimal the legend prints, so the number under the ramp is
  // exactly the number the bands were cut with.
  return { lo: oneDecimal(lo), hi: oneDecimal(hi) };
}

/** Step 0 is the darkest, `RAMP_STEPS - 1` the brightest. */
export function scaleBand(rating: number, scale: RatingScale): number {
  const span = scale.hi - scale.lo;
  if (!(span > 0)) return RAMP_STEPS - 1;
  const step = Math.floor(((rating - scale.lo) / span) * RAMP_STEPS);
  return Math.min(RAMP_STEPS - 1, Math.max(0, step));
}

function oneDecimal(n: number): number {
  return Math.round(n * 10) / 10;
}

function usable(r: EpisodeRating): boolean {
  return (
    Number.isFinite(r.season) &&
    Number.isFinite(r.episode) &&
    Number.isFinite(r.rating) &&
    r.season > 0 &&
    r.episode >= 0 &&
    r.rating > 0
  );
}

/**
 * Group rows into seasons, ascending, each season's episodes in order.
 * Rows for a season `sizes` does not know about are kept: the show gained a
 * season since the catalog row was written, and dropping it would hide it.
 */
export function summarizeSeasons(rows: EpisodeRating[], sizes: SeasonSize[]): SeasonSummary[] {
  const expected = new Map<number, number>();
  for (const s of sizes) {
    if (!Number.isFinite(s.seasonNumber) || s.seasonNumber <= 0) continue;
    const count = Number.isFinite(s.episodeCount) ? Math.max(0, Math.trunc(s.episodeCount)) : 0;
    expected.set(s.seasonNumber, count);
  }

  const bySeason = new Map<number, EpisodeRating[]>();
  const seen = new Set<string>();
  for (const r of rows) {
    if (!usable(r)) continue;
    const key = `${r.season}:${r.episode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const list = bySeason.get(r.season);
    if (list) list.push(r);
    else bySeason.set(r.season, [r]);
  }

  return [...bySeason.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([season, episodes]) => {
      episodes.sort((a, b) => a.episode - b.episode);
      const sum = episodes.reduce((acc, e) => acc + e.rating, 0);
      return {
        season,
        average: oneDecimal(sum / episodes.length),
        rated: episodes.length,
        expected: Math.max(expected.get(season) ?? 0, episodes.length),
        episodes,
      };
    });
}

/** Highest average wins; ties go to the season with more rated episodes, then the earlier one. */
function pickPeak(seasons: SeasonSummary[]): SeasonSummary {
  return seasons.reduce((best, s) =>
    s.average > best.average || (s.average === best.average && s.rated > best.rated) ? s : best,
  );
}

/** Lowest average wins; ties go to the season with more rated episodes, then the earlier one. */
function pickTrough(seasons: SeasonSummary[]): SeasonSummary {
  return seasons.reduce((worst, s) =>
    s.average < worst.average || (s.average === worst.average && s.rated > worst.rated) ? s : worst,
  );
}

/**
 * "Season 4 is the peak: 9.4 average across 10 episodes. Season 6 drops to 7.1."
 * Both numbers are the average of the cells in that column, so a reader can
 * check either one off the grid. When every season averages the same, the
 * second sentence says nothing and is dropped.
 */
export function peakTroughSentence(seasons: SeasonSummary[]): string {
  if (seasons.length === 0) return "";
  const peak = pickPeak(seasons);
  const trough = pickTrough(seasons);
  const first = `Season ${peak.season} is the peak: ${peak.average.toFixed(1)} average across ${peak.rated} episode${peak.rated === 1 ? "" : "s"}.`;
  if (trough.season === peak.season || trough.average >= peak.average) return first;
  return `${first} Season ${trough.season} drops to ${trough.average.toFixed(1)}.`;
}

/**
 * The heatmap for one show, or null when the show has not earned one: fewer
 * than two seasons with any ratings, an unknown episode count, or ratings for
 * under 60% of the episodes it is meant to have.
 */
export function buildEpisodeHeatmap(
  rows: EpisodeRating[],
  sizes: SeasonSize[],
): EpisodeHeatmap | null {
  const seasons = summarizeSeasons(rows, sizes);
  if (seasons.length < EPISODE_SEASONS_MIN) return null;

  // The denominator has to come from the catalog row. Without it the only
  // number available is the count of episodes we happen to hold, which would
  // report every show as fully covered.
  const known = new Map<number, number>();
  let counted = 0;
  for (const s of sizes) {
    if (!Number.isFinite(s.seasonNumber) || s.seasonNumber <= 0) continue;
    const count = Number.isFinite(s.episodeCount) ? Math.trunc(s.episodeCount) : 0;
    if (count > 0) counted += count;
    known.set(s.seasonNumber, count);
  }
  if (counted <= 0) return null;
  for (const s of seasons) known.set(s.season, Math.max(known.get(s.season) ?? 0, s.rated));

  let expected = 0;
  for (const count of known.values()) expected += Math.max(0, count);
  if (expected <= 0) return null;

  const rated = seasons.reduce((acc, s) => acc + s.rated, 0);
  const coverage = Math.min(1, rated / expected);
  if (coverage < EPISODE_COVERAGE_MIN) return null;

  return {
    seasons,
    rated,
    expected,
    coverage,
    peak: pickPeak(seasons),
    trough: pickTrough(seasons),
    sentence: peakTroughSentence(seasons),
    longestSeason: seasons.reduce((max, s) => Math.max(max, s.rated), 0),
    scale: ratingScale(seasons.flatMap((s) => s.episodes.map((e) => e.rating))),
  };
}
