-- Record of a change already applied to the live project.
--
-- Bing Webmaster Tools flagged "IndexNow is in batch mode" and it was right.
--
-- The old filter was "any row touched in the last 25 hours". The nightly TMDB
-- refresh touches roughly 6,500 rows a night whether or not anything a reader
-- would notice moved, so every night we told Bing that thousands of pages had
-- changed when they had not:
--
--   Aug 21   1,450 URLs
--   Aug 22   7,332
--   Aug 23   9,570
--   Aug 24   9,507   (hitting the query's own 9,000 cap)
--
-- Announcing unchanged pages teaches a search engine to discount the signal,
-- and it buries the handful of pages that genuinely did change.
--
-- Change is now decided by a hash of what the page actually says. vote_count
-- and popularity are deliberately excluded: they drift every night without
-- altering a word on screen, and the prose rounds vote counts to hundreds.

create or replace function public.media_content_hash(
  p_title text, p_score integer, p_streaming text[], p_release text, p_overview text, p_poster text
) returns text
language sql immutable
as $$
  select md5(
    coalesce(p_title,'') || '|' ||
    coalesce(p_score::text,'') || '|' ||
    coalesce(array_to_string(p_streaming, ','),'') || '|' ||
    coalesce(p_release,'') || '|' ||
    coalesce(left(p_overview, 300),'') || '|' ||
    coalesce(p_poster,'')
  );
$$;

comment on function public.media_content_hash is
  'What a searcher would notice changing on a title page: its name, its score, where to watch it, when it came out, its synopsis and its art.';

alter table public.media add column if not exists indexnow_hash text;
alter table public.collections add column if not exists indexnow_hash text;
create index if not exists idx_media_indexnow_hash on public.media (indexnow_hash);

comment on column public.media.indexnow_hash is
  'Content hash at the time this URL was last submitted to IndexNow.';

-- Seeded so the first run after this submits genuine changes only, rather than
-- announcing all 74,734 pages at once and repeating the exact mistake.
update public.media
set indexnow_hash = public.media_content_hash(
  title, rating_balasaur, streaming, release_date, overview, poster_url);
update public.collections set indexnow_hash = content_hash;

create or replace function public.ping_indexnow(p_full boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_key     text := 'd50e38be1b86ef6ef1079ff766aa2079';
  v_origin  text := 'https://balasaur.com';
  v_cap     int  := 2000;
  v_urls    text[] := '{}';
  v_media   int := 0;
  v_colls   int := 0;
  v_eligible int := 0;
  v_skipped int;
  v_request bigint;
begin
  -- indexable_media is the sitemap gate (a view); indexnow_hash lives on the
  -- base table, so the two are joined rather than assumed to be the same shape.
  create temp table _in_media on commit drop as
  select im.media_id, im.media_type, im.title, im.vote_count,
         public.media_content_hash(m.title, m.rating_balasaur, m.streaming,
                                   m.release_date, m.overview, m.poster_url) as h
  from public.indexable_media im
  join public.media m using (media_id)
  where p_full
     or m.indexnow_hash is distinct from
        public.media_content_hash(m.title, m.rating_balasaur, m.streaming,
                                  m.release_date, m.overview, m.poster_url);

  create temp table _in_coll on commit drop as
  select slug, content_hash from public.collections
  where p_full or indexnow_hash is distinct from content_hash;

  select count(*) into v_eligible from _in_media;
  select count(*) into v_colls from _in_coll;

  select coalesce(array_agg(v_origin || '/best/' || slug order by slug), '{}')
    into v_urls from _in_coll;

  select v_urls || coalesce(array_agg(url), '{}') into v_urls
  from (
    select v_origin || canonical_media_path(media_id, media_type, title) as url
    from _in_media
    where canonical_media_path(media_id, media_type, title) is not null
    order by vote_count desc nulls last
    limit v_cap
  ) t;
  v_media := least(v_eligible, v_cap);

  select count(*) into v_skipped from _in_media
  where canonical_media_path(media_id, media_type, title) is null;

  if coalesce(array_length(v_urls, 1), 0) = 0 then
    return jsonb_build_object('submitted', 0, 'media', 0, 'collections', 0,
                              'eligible_media', v_eligible, 'dropped_over_cap', 0,
                              'skipped_non_ascii', v_skipped, 'request_id', null,
                              'note', 'nothing changed');
  end if;

  -- The homepage and the collections index change whenever anything under them
  -- does, so they ride along whenever there is anything at all to report.
  v_urls := array[v_origin || '/', v_origin || '/collections'] || v_urls;

  select net.http_post(
    url     := 'https://api.indexnow.org/indexnow',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object('host','balasaur.com','key',v_key,
                 'keyLocation', v_origin || '/' || v_key || '.txt',
                 'urlList', to_jsonb(v_urls))
  ) into v_request;

  -- Only mark what actually went out, so anything past the cap is picked up
  -- tomorrow instead of being silently never announced.
  update public.media m set indexnow_hash = t.h
  from (select media_id, h from _in_media
        where canonical_media_path(media_id, media_type, title) is not null
        order by vote_count desc nulls last limit v_cap) t
  where m.media_id = t.media_id;

  update public.collections c set indexnow_hash = t.content_hash
  from _in_coll t where c.slug = t.slug;

  return jsonb_build_object(
    'submitted', array_length(v_urls, 1),
    'media', v_media, 'collections', v_colls,
    'eligible_media', v_eligible,
    'dropped_over_cap', greatest(v_eligible - v_cap, 0),
    'skipped_non_ascii', v_skipped,
    'request_id', v_request
  );
end;
$function$;

-- Settle EVERY unsettled run, not just the most recent one. The old version
-- took `order by id desc limit 1`, so once two runs went unanswered it could
-- never catch up: three consecutive nights sat with a null status_code and
-- nobody knew whether Bing was accepting the submissions at all.
create or replace function public.indexnow_nightly()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  res jsonb;
begin
  update public.indexnow_log l
  set status_code = r.status_code,
      detail = coalesce(l.detail, '') || ' | ' ||
               coalesce(left(r.content, 200), r.error_msg, 'no response retained')
  from net._http_response r
  where r.id = l.request_id and l.status_code is null and l.request_id is not null;

  select public.ping_indexnow() into res;

  insert into public.indexnow_log (submitted, request_id, detail)
  values (
    coalesce((res->>'submitted')::int, 0),
    (res->>'request_id')::bigint,
    format('media=%s collections=%s eligible=%s dropped_over_cap=%s skipped_non_ascii=%s',
           coalesce(res->>'media','0'), coalesce(res->>'collections','0'),
           coalesce(res->>'eligible_media','0'), coalesce(res->>'dropped_over_cap','0'),
           coalesce(res->>'skipped_non_ascii','0'))
  );
end
$function$;
