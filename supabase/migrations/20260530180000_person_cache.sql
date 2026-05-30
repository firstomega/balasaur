
CREATE TABLE public.person_cache (
  id bigint PRIMARY KEY,
  name text,
  popularity double precision,
  payload jsonb,
  fetched_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_person_cache_lower_name ON public.person_cache (lower(name));

GRANT SELECT ON public.person_cache TO anon, authenticated;
GRANT ALL ON public.person_cache TO service_role;

ALTER TABLE public.person_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "person_cache is publicly readable"
  ON public.person_cache FOR SELECT
  USING (true);
