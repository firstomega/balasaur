
CREATE TABLE public.media_cache (
  id text PRIMARY KEY,
  media_type text NOT NULL,
  tmdb_id bigint NOT NULL,
  title text,
  year text,
  popularity double precision,
  summary_payload jsonb,
  summary_fetched_at timestamptz,
  detail_payload jsonb,
  detail_fetched_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_media_cache_type_popularity
  ON public.media_cache (media_type, popularity DESC NULLS LAST);
CREATE INDEX idx_media_cache_lower_title
  ON public.media_cache (lower(title));

GRANT SELECT ON public.media_cache TO anon, authenticated;
GRANT ALL ON public.media_cache TO service_role;

ALTER TABLE public.media_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "media_cache is publicly readable"
  ON public.media_cache FOR SELECT
  USING (true);

CREATE TABLE public.trending_cache (
  key text PRIMARY KEY,
  ids text[] NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.trending_cache TO anon, authenticated;
GRANT ALL ON public.trending_cache TO service_role;

ALTER TABLE public.trending_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trending_cache is publicly readable"
  ON public.trending_cache FOR SELECT
  USING (true);
