-- Advanced filter facets (Phase A): sub-genres, themes, audience, film length,
-- completion status. All derived from data ALREADY stored in raw_tmdb
-- (keywords / certifications / status / runtime) by src/lib/taxonomy.ts, and
-- populated by the sync row-builder + the backfill — no new external API calls.
-- GIN indexes back the server-side array filters in queryCatalog (the follow-up
-- filtering PR uses .overlaps on these columns).

ALTER TABLE public.media
  ADD COLUMN IF NOT EXISTS sub_genres          text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS themes              text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS audience            text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS film_length_minutes integer,
  ADD COLUMN IF NOT EXISTS completion_status   text;

CREATE INDEX IF NOT EXISTS idx_media_sub_genres        ON public.media USING gin (sub_genres);
CREATE INDEX IF NOT EXISTS idx_media_themes            ON public.media USING gin (themes);
CREATE INDEX IF NOT EXISTS idx_media_audience          ON public.media USING gin (audience);
CREATE INDEX IF NOT EXISTS idx_media_completion_status ON public.media (completion_status);
CREATE INDEX IF NOT EXISTS idx_media_film_length       ON public.media (film_length_minutes);
