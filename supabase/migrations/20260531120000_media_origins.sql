-- "Origin" facet (Model D): geographic/cultural axis derived from each title's
-- original language + production countries. Populated by syncCatalog going
-- forward and by backfillFromRaw for existing rows (no API calls).
ALTER TABLE public.media
  ADD COLUMN IF NOT EXISTS origins text[] NOT NULL DEFAULT '{}';
