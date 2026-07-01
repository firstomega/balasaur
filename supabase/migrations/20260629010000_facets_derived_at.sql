-- Incremental backfill: stamp each media row once its facets/derivations are computed,
-- so the nightly backfill can skip already-done rows instead of re-reading every fat
-- raw_tmdb/raw_omdb blob (which was slow and occasionally timed out with HTTP 000).
-- The partial index keeps "rows still needing a pass" cheap to find.
-- NOTE: Lovable Cloud owns the DB and does not auto-apply repo migrations — this was
-- applied live via the Lovable SQL editor; this file keeps the repo schema in sync.

alter table public.media add column if not exists facets_derived_at timestamptz;

create index if not exists idx_media_facets_pending
  on public.media (media_id)
  where facets_derived_at is null;
