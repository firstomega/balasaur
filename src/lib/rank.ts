// The default-view ranking: one number blending buzz, quality, and freshness so
// the homepage stops being a raw TMDB-popularity dump (which surfaced obscure
// high-churn titles above universally loved ones).
//
//   rank_score = 45·popularity + 40·quality + 15·recency   (each component 0–1)
//
// - popularity: log-scaled TMDB popularity, saturating at 1000 (log because the
//   raw value is a power-law — linear would let one viral title's 3000 drown
//   everything).
// - quality: the Balasaur Score (0–100), shrunk toward a catalog-typical prior
//   by vote confidence (IMDb-style Bayesian weighting) so a 9.0 from 40 votes
//   can't outrank an 8.5 from 400k votes. Titles with critic ratings but no
//   stored vote_count get a modest default confidence rather than zero.
// - recency: exponential decay on release/first-air date (τ = 2.5 years), so
//   this week's big premiere beats an equally scored 2015 title, while classics
//   still rank on popularity + quality alone.
//
// Mirrored in SQL by the one-shot backfill in
// supabase/migrations/*_rank_score_and_sensitive.sql — keep the constants in
// sync or the nightly TS recompute will fight the SQL-seeded values.
// Rounded to 1 decimal so day-to-day recency drift doesn't dirty every row on
// every backfill pass (skip-unchanged stays effective).

const PRIOR = 62; // catalog-typical Balasaur Score
const CONFIDENCE_VOTES = 300; // votes at which quality counts ~50/50 vs the prior
const RATED_DEFAULT_VOTES = 100; // assumed votes when rated but vote_count unknown
const POP_SATURATION = 1000; // raw popularity treated as "maximum buzz"
const RECENCY_TAU_YEARS = 2.5;

export function computeRankScore(
  s: {
    popularity?: number | null;
    balasaur?: number | null;
    voteCount?: number | null;
    /** ISO date string ("YYYY-MM-DD..."); missing/unparsable → no recency bonus. */
    releaseDate?: string | null;
  },
  now: Date = new Date(),
): number {
  const pop =
    Math.min(Math.log1p(Math.max(s.popularity ?? 0, 0)) / Math.log(1 + POP_SATURATION), 1) * 100;

  const q = s.balasaur ?? PRIOR;
  const votes = s.voteCount ?? (s.balasaur != null ? RATED_DEFAULT_VOTES : 0);
  const confidence = votes / (votes + CONFIDENCE_VOTES);
  const quality = confidence * q + (1 - confidence) * PRIOR;

  let recency = 0;
  const parsed = parseIsoDate(s.releaseDate);
  if (parsed != null) {
    const ageYears = Math.max((now.getTime() - parsed) / (365.25 * 24 * 3600 * 1000), 0);
    recency = Math.exp(-ageYears / RECENCY_TAU_YEARS) * 100;
  }

  return Math.round((0.45 * pop + 0.4 * quality + 0.15 * recency) * 10) / 10;
}

function parseIsoDate(d?: string | null): number | null {
  if (!d || !/^\d{4}-\d{2}-\d{2}/.test(d)) return null;
  const t = Date.parse(d.slice(0, 10));
  return Number.isNaN(t) ? null : t;
}
