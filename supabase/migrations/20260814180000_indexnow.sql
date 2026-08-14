-- Applied to the live project 2026-08-14. This file is the record, not the
-- source of truth (Lovable Cloud does not auto-apply repo migrations).
--
-- Two things: one shared definition of which titles are worth putting in front
-- of a search engine, and a nightly IndexNow push so Bing hears about changes
-- instead of waiting to crawl. Bing is what ChatGPT search and Copilot answer
-- from, so this is the shortest path to being citable by an AI assistant.
--
-- Deliberately not a CI job: the catalog already rebuilds nightly inside the
-- database on pg_cron, so the announcement lives next to the work it announces.

-- 1. The index gate, mirroring isCorroborated() in src/lib/indexability.ts.
--    Read by listSitemapEntries() and by ping_indexnow() below, so a URL can
--    never be submitted whose page renders noindex. Change one, change both.
create or replace view public.indexable_media
with (security_invoker = true) as
select *
from public.media
where sensitive = false
  and poster_url is not null
  and overview is not null
  and overview <> ''
  and rating_balasaur is not null
  and (coalesce(vote_count, 0) >= 250
       or rating_rotten_tomatoes is not null
       or rating_metacritic is not null);

comment on view public.indexable_media is
  'Titles eligible for search indexing. Mirrors isCorroborated() in src/lib/indexability.ts.';

revoke all on public.indexable_media from anon, authenticated;
grant select on public.indexable_media to service_role;

-- 2. HTTP from Postgres.
create extension if not exists pg_net with schema extensions;

-- 3. Canonical detail path, mirroring mediaSlug()/slugify() in src/lib/slug.ts:
--    lowercase, runs of non-alphanumerics to a hyphen, trimmed, capped at 80
--    characters, then "<slug>-<id>".
--
--    ASCII titles only. The JS version strips accents via NFKD before the
--    alphanumeric pass, which Postgres cannot reproduce identically without
--    unaccent, and a near-miss would announce a URL that 301s elsewhere.
--    Returns null for anything else so the caller skips it: 17,581 of 17,735
--    indexable titles are ASCII, and the rest still reach crawlers via the
--    sitemap. Verified against the TypeScript output on a sample including
--    "Monsters, Inc." and "Kill Bill: Vol. 1".
create or replace function public.canonical_media_path(
  p_media_id text, p_media_type text, p_title text
) returns text
language sql
immutable
as $$
  select case
    when p_title is null or p_title !~ '^[[:ascii:]]*$' then null
    else '/' || case when p_media_type = 'tv' then 'tv' else 'movie' end || '/' ||
      case when s = '' then id_part else s || '-' || id_part end
  end
  from (
    select
      regexp_replace(
        left(
          regexp_replace(
            regexp_replace(
              regexp_replace(lower(coalesce(p_title, '')), '[^a-z0-9]+', '-', 'g'),
              '^-+', ''),
            '-+$', ''),
          80),
        '-+$', '') as s,
      regexp_replace(p_media_id, '^(movie|tv)-', '') as id_part
  ) t;
$$;

-- 4. The announcement itself. One endpoint fans out to Bing, Yandex, Seznam
--    and Naver. p_full resubmits everything indexable rather than the last day.
create or replace function public.ping_indexnow(p_full boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key     text := 'd50e38be1b86ef6ef1079ff766aa2079';
  v_origin  text := 'https://balasaur.com';
  v_since   timestamptz := now() - interval '25 hours';
  v_urls    text[];
  v_skipped int;
  v_request bigint;
begin
  v_urls := array[v_origin || '/', v_origin || '/collections'];

  -- Every ranked collection rebuilt in the last day. Slugs are stored, so
  -- these URLs are exact.
  select v_urls || coalesce(array_agg(v_origin || '/best/' || slug order by slug), '{}')
    into v_urls
  from public.collections
  where p_full or updated_at >= v_since;

  -- Indexable titles whose data moved, capped under IndexNow's 10,000-URL
  -- limit for a single submission.
  select v_urls || coalesce(array_agg(url), '{}') into v_urls
  from (
    select v_origin || canonical_media_path(media_id, media_type, title) as url
    from public.indexable_media
    where (p_full or updated_at >= v_since)
      and canonical_media_path(media_id, media_type, title) is not null
    order by vote_count desc nulls last
    limit 9000
  ) t;

  select count(*) into v_skipped
  from public.indexable_media
  where (p_full or updated_at >= v_since)
    and canonical_media_path(media_id, media_type, title) is null;

  -- pg_net validates this header strictly and raises on "; charset=utf-8".
  select net.http_post(
    url     := 'https://api.indexnow.org/indexnow',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object(
                 'host', 'balasaur.com',
                 'key', v_key,
                 'keyLocation', v_origin || '/' || v_key || '.txt',
                 'urlList', to_jsonb(v_urls)
               )
  ) into v_request;

  return jsonb_build_object(
    'submitted', array_length(v_urls, 1),
    'skipped_non_ascii', v_skipped,
    'request_id', v_request
  );
end;
$$;

revoke all on function public.ping_indexnow(boolean) from public, anon, authenticated;

comment on function public.ping_indexnow(boolean) is
  'Announce changed URLs to IndexNow. p_full => resubmit everything indexable.';

-- 5. Twenty minutes after rebuild_collections() (jobid 1, 20 9 * * *), so the
--    collections it announces are the ones just rebuilt.
-- select cron.schedule('indexnow-nightly', '40 9 * * *', $$select public.ping_indexnow()$$);

-- Verified end to end on 2026-08-14 against the deployed site. The first
-- submission returned 403 SiteVerificationNotCompleted, which is IndexNow
-- checking the key file asynchronously the first time a host appears, not a
-- rejected key. A retry minutes later returned 200 with an empty body, its
-- success response, accepting 9,346 URLs.
