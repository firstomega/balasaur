
CREATE TABLE public.media (
  media_id TEXT PRIMARY KEY,
  media_type TEXT NOT NULL,
  title TEXT NOT NULL,
  year TEXT,
  poster_url TEXT,
  overview TEXT,
  popularity DOUBLE PRECISION,
  release_date TEXT,
  rating_imdb DOUBLE PRECISION,
  rating_rotten_tomatoes INTEGER,
  rating_metacritic INTEGER,
  rating_tmdb DOUBLE PRECISION,
  genres TEXT[] NOT NULL DEFAULT '{}',
  streaming TEXT[] NOT NULL DEFAULT '{}',
  length_label TEXT,
  people JSONB NOT NULL DEFAULT '[]'::jsonb,
  seasons JSONB,
  raw_tmdb JSONB,
  raw_omdb JSONB,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_media_popularity ON public.media (popularity DESC NULLS LAST);
CREATE INDEX idx_media_type ON public.media (media_type);
CREATE INDEX idx_media_fetched_at ON public.media (fetched_at);

GRANT SELECT ON public.media TO anon;
GRANT SELECT ON public.media TO authenticated;
GRANT ALL ON public.media TO service_role;

ALTER TABLE public.media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Catalog is publicly readable"
  ON public.media FOR SELECT
  USING (true);
-- No INSERT/UPDATE/DELETE policies: only service_role can write (bypasses RLS).
