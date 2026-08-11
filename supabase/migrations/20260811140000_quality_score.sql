-- quality_score: the vote-confidence-shrunk Balasaur Score (IMDb-Top-250-style
-- Bayesian weighting), powering the "Top Rated" sort. Fixes "100 from 3 votes
-- outranks 92 from 400k votes" WITHOUT a vote-count threshold: low-vote titles
-- are pulled toward the catalog prior in proportion to their uncertainty, never
-- excluded. Mirrors computeQualityScore in src/lib/rank.ts (same constants:
-- prior 62, m=300, rated-default 100 votes); the nightly backfill keeps it
-- fresh as vote counts heal. NULL for unrated titles — a ratings sort puts
-- titles with no rating last, which is what "Top Rated" means.

alter table public.media add column if not exists quality_score double precision;

update public.media
set quality_score = round(
  (
    (coalesce(vote_count, 100) / (coalesce(vote_count, 100) + 300.0)) * rating_balasaur
    + (1 - (coalesce(vote_count, 100) / (coalesce(vote_count, 100) + 300.0))) * 62
  )::numeric,
  1
)::double precision
where rating_balasaur is not null;

create index if not exists idx_media_quality_score
  on public.media (quality_score desc nulls last);
