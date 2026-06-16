
-- 1. Revoke public/authenticated SELECT on raw API payload columns.
REVOKE SELECT (raw_omdb, raw_tmdb) ON public.media FROM anon, authenticated;

-- 2. Pin search_path on user-defined functions.
ALTER FUNCTION public.catalog_facets() SET search_path = public;
ALTER FUNCTION public.search_cast(text, text[]) SET search_path = public;
