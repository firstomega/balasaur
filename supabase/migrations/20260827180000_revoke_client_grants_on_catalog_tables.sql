-- Applied to the live project first, mirrored here per the house rule.
--
-- Every catalog and infrastructure table granted anon and authenticated the
-- full set: SELECT, INSERT, UPDATE and DELETE. Nothing but Row Level Security
-- staying switched on stood between the anon key that ships in the site's
-- JavaScript and DELETE across 77,672 catalog rows. RLS is a second lock, not
-- the only one.
--
-- SELECT mattered separately: media_cache alone is 6.8 GB of cached vendor
-- payloads and person_cache another 832 MB, all pageable through PostgREST on
-- the owner's bandwidth, along with the whole Balasaur Score dataset that is
-- the site's one differentiated asset.
--
-- Safe because the browser never touches these. Verified by reading every
-- client-side Supabase call in src/: the only direct table access from the
-- browser is user_media_status, plus the night_* RPCs (SECURITY DEFINER, so
-- unaffected by table grants) and one realtime channel. Catalog reads,
-- collections, profiles and sitemaps all go through TanStack server functions
-- using supabaseAdmin with the service role.
--
-- No view depends on these grants either: indexable_media is security_invoker
-- and person_index is materialized, and anon can SELECT neither.
--
-- Deliberately NOT touched: user_media_status, saved_filters and profiles.
-- Those hold user data, carry four RLS policies each, and the browser really
-- does read and write user_media_status for signed-in visitors.
--
-- Verified after applying: 0 of the 14 tables reachable by anon or
-- authenticated, service_role still reads all of them, authenticated keeps
-- SELECT and INSERT on user_media_status, and night_state remains callable.

revoke all on table
  public.media,
  public.media_cache,
  public.person_cache,
  public.collections,
  public.collection_items,
  public.catalog_facets_cache,
  public.person_collection_roster,
  public.trending_cache,
  public.gsc_page_daily,
  public.gsc_performance,
  public.gsc_sync_log,
  public.indexnow_log,
  public.crawl_health,
  public.index_status
from anon, authenticated;
