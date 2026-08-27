-- Applied to the live project first, mirrored here per the house rule.
--
-- Two SECURITY DEFINER maintenance functions were callable by anyone holding
-- the anon key, which ships in the site's JavaScript. Each does a full-table
-- pass over the catalog, so a 200-byte request bought seconds of IO on the
-- single database every page depends on. A trivial script could keep the site
-- slow or down for the cost of a loop.
--
-- Both are only ever invoked by pg_cron as postgres:
--   rebuild-collections     20 9 * * *   select public.rebuild_collections();
--   facets-cache-refresh    50 9 * * *   select public.refresh_catalog_facets_cache()
-- Neither is called from application code. postgres and service_role keep
-- EXECUTE, so both scheduled jobs are unaffected. Verified after applying:
-- anon and authenticated now false, postgres and service_role still true.
--
-- Swept the rest of the schema at the same time: no other SECURITY DEFINER
-- function outside the night_* room API is executable by anon.

revoke execute on function public.rebuild_collections() from public, anon, authenticated;
revoke execute on function public.refresh_catalog_facets_cache() from public, anon, authenticated;
