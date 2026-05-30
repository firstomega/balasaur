
CREATE TABLE IF NOT EXISTS public.person_cache (
  id bigint PRIMARY KEY,
  name text NOT NULL,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.person_cache TO anon, authenticated;
GRANT ALL ON public.person_cache TO service_role;

ALTER TABLE public.person_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "person_cache readable by everyone"
  ON public.person_cache FOR SELECT
  USING (true);
