-- Offer Google a few thousand strong pages instead of about 70,000.
--
-- NOT YET APPLIED. Written 2026-10-16 for the owner to apply to the live
-- project, followed straight away by 20261016010001_index_diet_followup.sql,
-- which fills the people set (it parses TMDB credits for about 9,000 titles,
-- too slow to sit inside a migration). Until the follow-up runs, every person
-- page says noindex, the people sitemap is empty, and index_status_sample()
-- errors, which fails the Monday and Thursday 10:30 index inspection
-- (index_status_snapshot). If the follow-up is skipped, the 09:36 job below
-- fills the people set itself the next morning.
-- Safe to run twice.
--
-- WHY. On 2026-10-15 the site offered about 70,000 near-identical pages on a
-- five-month-old domain with no backlinks. Google indexed about 21% of a
-- sample, stopped crawling most of the site in mid-September, and the
-- impressions it gave came from positions 80 to 95.
--
-- WHAT. One kept set per page family. A page outside its set keeps working,
-- stays linked, says "noindex, follow", and is left out of the sitemaps and of
-- IndexNow. Nothing is deleted: raising a threshold below brings pages back.
-- Each set is the single source the page head, the sitemap and IndexNow read.
--
--   titles  index_kept_media, a view. Mirrors isKeptTitle() in
--           src/lib/indexKeep.ts; indexKeep.test.ts reads this file and fails
--           if the thresholds or the pin list drift. 82,490 titles can stand
--           alone (indexable_media); 3,744 are kept.
--   people  person_index_kept, top 850 by fame, materialized. Was 10,970.
--   lists   collection_index_kept, materialized, with the reason on every
--           row. 219 of 738 lists are kept, plus the request-time country
--           shelves, which have no parent list and stay kept.
--
-- indexable_media itself is untouched: person_index and search still read
-- the wider substance rule.

-- ---------------------------------------------------------------------------
-- 1. Titles
-- ---------------------------------------------------------------------------
-- Every title URL index_status has ever recorded as indexed (302, checked
-- 2026-10-15) stays in this set: 274 movies all have 3,000+ votes, 26 of 27
-- shows have 300+, and the one that does not, El cor de la ciutat, is pinned.
-- The 302nd, Prime Rewind: Inside the Boys, is no longer in the catalog.
create or replace view public.index_kept_media
with (security_invoker = true) as
select im.*
from public.indexable_media im
where im.media_id in ('tv-14743')                           -- TITLE_KEEP_PINNED
   or (im.media_type = 'tv' and im.vote_count >= 300)       -- TITLE_KEEP_MIN_VOTES_TV
   or (im.media_type <> 'tv' and im.vote_count >= 3000);    -- TITLE_KEEP_MIN_VOTES_MOVIE

comment on view public.index_kept_media is
  'Titles offered to Google: indexable_media plus 3,000+ TMDB votes (movies), 300+ (shows), or pinned because Google already indexed them. Mirrors isKeptTitle() in src/lib/indexKeep.ts. Sitemap, IndexNow and the page head all read this rule.';

revoke all on public.index_kept_media from anon, authenticated;
grant select on public.index_kept_media to service_role;

-- ---------------------------------------------------------------------------
-- 2. People
-- ---------------------------------------------------------------------------
-- Fame is the summed TMDB votes of a person's ten best titles, counting top-8
-- billing or a directing credit (the same credits person_index counts), with
-- a show's votes counted three times. Kept: the top 850 who also clear the
-- old filmography gate (8+ titles in person_index).
--
-- Why these numbers, read 2026-10-15:
--   * Five titles and no TV weight put Jackie Chan 944th, Jenna Ortega
--     1,410th and Nicole Kidman 579th: votes favour recent Western films.
--   * Ten titles with shows at 3x: Kidman 420th, J.J. Abrams 449th, Ortega
--     646th, Daisy Ridley 671st, Chan 830th. Shows at 5x let ensemble casts
--     of a few hit shows take 127 of the top 500.
--   * 850 is the smallest round cut that keeps every genuinely famous person
--     on the index panel. Kana Hanazawa (2,364th) and Ian Anthony Dale
--     (4,191st) fall outside and are swapped off the panel below.
--
-- Created empty: filling it parses TMDB credits for every title with 500+
-- votes. The follow-up file fills it; cron keeps it fresh after that, and
-- fills it at 09:36 on its own if the follow-up was skipped.
create materialized view if not exists public.person_index_kept as
with base as (
  select media_id, media_type, vote_count, raw_tmdb->'credits' as cr
  from public.indexable_media
  where vote_count >= 500                                   -- PERSON_FAME_MIN_TITLE_VOTES
),
credits as (
  select (p->>'id')::bigint as person_id, b.media_id, b.media_type, b.vote_count
  from base b, jsonb_array_elements(coalesce(b.cr->'cast', '[]'::jsonb)) p
  where (p->>'order')::int < 8
  union
  select (p->>'id')::bigint, b.media_id, b.media_type, b.vote_count
  from base b, jsonb_array_elements(coalesce(b.cr->'crew', '[]'::jsonb)) p
  where p->>'job' = 'Director'
),
weighted as (
  select person_id, media_id,
         vote_count * case when media_type = 'tv' then 3 else 1 end as v  -- PERSON_FAME_TV_WEIGHT
  from credits
  where person_id is not null
),
best as (
  select person_id, v, row_number() over (partition by person_id order by v desc, media_id) as k
  from weighted
),
fame as (
  select person_id, sum(v)::bigint as fame
  from best
  where k <= 10                                             -- PERSON_FAME_TOP_TITLES
  group by person_id
),
ranked as (
  select f.person_id, pi.name, f.fame,
         row_number() over (order by f.fame desc, f.person_id)::int as fame_rank
  from fame f
  join public.person_index pi on pi.person_id = f.person_id
  where pi.titles >= 8
)
select person_id, name, fame, fame_rank
from ranked
where fame_rank <= 850                                      -- PERSON_KEEP_COUNT
with no data;

create unique index if not exists person_index_kept_person_id on public.person_index_kept (person_id);

comment on materialized view public.person_index_kept is
  'People offered to Google: top 850 by fame (summed TMDB votes of their ten best titles, shows x3) among people with 8+ titles. The person page, the people sitemap and the index sample read it. Constants in src/lib/indexKeep.ts.';

revoke all on public.person_index_kept from anon, authenticated;
grant select on public.person_index_kept to service_role;

-- ---------------------------------------------------------------------------
-- 3. Lists
-- ---------------------------------------------------------------------------
-- A list is offered when it has 10+ titles, is not a person list (the person
-- page owns "[name] movies"), and fewer than half of its top ten already
-- appear on each parent list's page:
--
--   genre on a service  vs the service list and vs the genre list
--   a year              vs its decade
--   origin and genre    vs the genre list and vs the country shelf
--
-- Service, genre, decade, occasion, discovery and award lists have no parent
-- and are kept when they have 10+ titles.
--
-- The country shelves (best-korean-shows and kin) are built at request time
-- by src/lib/originCollections.ts: the 60 rankable titles of that origin with
-- the highest quality_score. origin_pool below is the same selection, so an
-- origin-genre list is compared with the page a visitor would actually see.
--
-- Read 2026-10-15: kept 219 of 738. awards 3/3, decade 16/16, discovery 4/4,
-- genre 27/27, occasion 30/30, service 18/18, year 45/104, origin-genre 41/80,
-- genre-service 35/188, person 0/268.
create materialized view if not exists public.collection_index_kept as
with origin_defs(label, tok) as (
  values ('Korean', 'korean'), ('Japanese', 'japanese'), ('Chinese', 'chinese'),
         ('Indian', 'indian'), ('French', 'french'), ('Spanish', 'spanish'),
         ('British', 'british')
),
origin_pool as (
  select 'origin:' || tok || ':' || media_type as parent, media_id
  from (
    select d.tok, m.media_type, m.media_id,
           row_number() over (partition by d.tok, m.media_type
                              order by m.quality_score desc, m.media_id) as r
    from public.media m
    join origin_defs d on m.origins @> array[d.label]
    where m.suggestive = false
      and m.poster_url is not null
      and coalesce(m.overview, '') <> ''
      and m.rating_balasaur is not null
      and m.quality_score is not null
      and public.balasaur_rankable(m.media_type, m.title, m.genres, m.film_length_minutes, null,
            num_nonnulls(m.rating_imdb, m.rating_rotten_tomatoes, m.rating_metacritic, m.rating_tmdb),
            m.vote_count)
  ) z
  where r <= 60
),
parent_items as (
  select slug as parent, media_id from public.collection_items
  union all
  select parent, media_id from origin_pool
),
parents as (
  select c.slug, p.parent
  from public.collections c
  cross join lateral (values
    (case when c.kind = 'genre-service'
          then regexp_replace(c.slug, '^best-(.+)-(movies|shows)-on-(.+)$', 'best-\1-\2') end),
    (case when c.kind = 'genre-service'
          then regexp_replace(c.slug, '^best-(.+)-(movies|shows)-on-(.+)$', 'best-\2-on-\3') end),
    (case when c.kind = 'year'
          then regexp_replace(c.slug, '^best-(movies|shows)-of-([0-9]{3})[0-9]$', 'best-\1-of-the-\20s') end),
    (case when c.slug = 'best-k-dramas' then 'best-drama-shows'
          when c.kind = 'origin-genre'
          then regexp_replace(c.slug, '^best-[a-z]+-(.+)$', 'best-\1') end),
    (case when c.slug = 'best-k-dramas' then 'origin:korean:tv'
          when c.kind = 'origin-genre'
          then 'origin:' || split_part(c.slug, '-', 2) || ':' || c.media_type end)
  ) p(parent)
  where p.parent is not null
),
top10 as (
  select slug, media_id
  from public.collection_items
  where rank <= 10                                          -- LIST_OVERLAP_TOP
),
shared as (
  select p.slug, p.parent, count(b.media_id)::int as n
  from parents p
  join top10 a on a.slug = p.slug
  left join parent_items b on b.parent = p.parent and b.media_id = a.media_id
  group by p.slug, p.parent
),
judged as (
  select c.slug, c.kind, c.item_count,
         coalesce(t.n10, 0)::int as top_count,
         coalesce(s.max_shared, 0)::int as max_shared,
         s.parents
  from public.collections c
  left join (select slug, count(*) as n10 from top10 group by slug) t using (slug)
  left join (select slug, max(n) as max_shared, array_agg(parent order by parent) as parents
             from shared group by slug) s using (slug)
)
select slug, kind, item_count, top_count, max_shared, parents,
       (kind <> 'person'                                    -- LIST_NEVER_KEPT_KINDS
        and item_count >= 10                                -- LIST_KEEP_MIN_ITEMS
        and top_count > 0
        and max_shared * 2 < top_count) as kept             -- LIST_MAX_PARENT_SHARE (under half)
from judged;

create unique index if not exists collection_index_kept_slug on public.collection_index_kept (slug);

comment on materialized view public.collection_index_kept is
  'Every materialized list with whether it is offered to Google (kept) and why: max_shared is the most of its top ten any parent list (in parents) also shows. Refreshed after the nightly rebuild. Constants in src/lib/indexKeep.ts.';

revoke all on public.collection_index_kept from anon, authenticated;
grant select on public.collection_index_kept to service_role;

-- Kept fresh after the nightly jobs: rebuild_collections() at 09:20,
-- person_index at 09:30, IndexNow at 09:40, which reads both sets. Two jobs,
-- so a failure in one does not roll back the other.
select cron.schedule('collection-index-kept-refresh', '35 9 * * *',
  $$refresh materialized view concurrently public.collection_index_kept$$);
-- The people job heals itself: a concurrent refresh fails on a view that has
-- never been filled, so if the follow-up file was never run the job fills it
-- the plain way on its first night instead of failing every night after.
select cron.schedule('person-index-kept-refresh', '36 9 * * *', $$
do $job$
begin
  if exists (select 1 from pg_matviews
             where schemaname = 'public' and matviewname = 'person_index_kept'
               and ispopulated) then
    refresh materialized view concurrently public.person_index_kept;
  else
    refresh materialized view public.person_index_kept;
  end if;
end
$job$
$$);

-- ---------------------------------------------------------------------------
-- 4. IndexNow announces only kept URLs
-- ---------------------------------------------------------------------------
-- Patched in place, the house pattern for functions whose live body may have
-- drifted from the repo: read back, replace the two anchors, execute. Each
-- anchor must match exactly once.
do $mig$
declare
  d text;
  n int;
  coll_re constant text :=
    'from public\.collections\s+where p_full or indexnow_hash is distinct from content_hash';
begin
  select pg_get_functiondef(p.oid) into d
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'ping_indexnow';

  if position('index_kept_media' in d) > 0 then
    raise notice 'ping_indexnow already reads the kept sets, skipping';
    return;
  end if;

  n := (length(d) - length(replace(d, 'from public.indexable_media im', '')))
       / length('from public.indexable_media im');
  if n <> 1 then
    raise exception 'ping_indexnow: expected 1 indexable_media anchor, found %', n;
  end if;
  d := replace(d, 'from public.indexable_media im', 'from public.index_kept_media im');

  select count(*) into n from regexp_matches(d, coll_re, 'g');
  if n <> 1 then
    raise exception 'ping_indexnow: expected 1 collections anchor, found %', n;
  end if;
  d := regexp_replace(d, coll_re,
    'from public.collections' || E'\n' ||
    '  where slug in (select slug from public.collection_index_kept where kept)' || E'\n' ||
    '    and (p_full or indexnow_hash is distinct from content_hash)');

  execute d;
end
$mig$;

-- ---------------------------------------------------------------------------
-- 5. The rotating inspection sample draws from the kept sets
-- ---------------------------------------------------------------------------
-- A noindexed page inspected by gsc-sync only ever reports "excluded by
-- noindex", which would read as a fall in the indexed share when it is our
-- own decision. Same function as 20261015120200_index_panel.sql with the
-- three sources swapped; the windows and the panel are unchanged.
create or replace function public.index_status_sample()
returns text[]
language sql stable
set search_path = public
as $$
with d as (select (extract(epoch from now())::bigint / 86400)::int as day),
panel as (
  select url as u, 0 as grp, row_number() over (order by family, url) as ord
  from index_panel
),
c_all as (
  select slug, row_number() over (order by slug) - 1 as rn, count(*) over () as cnt
  from collection_index_kept
  where kept
),
cols as (
  select 'https://balasaur.com/best/' || slug as u
  from c_all, d
  where ((rn - (d.day * 17) % cnt + cnt) % cnt) < 35
),
t_all as (
  select media_id, media_type, title,
         row_number() over (order by vote_count desc nulls last, media_id) - 1 as rn
  from index_kept_media
  where title ~ '^[ -~]+$'
  order by vote_count desc nulls last, media_id
  limit 3000
),
titles as (
  select 'https://balasaur.com/' || media_type || '/'
         || regexp_replace(left(regexp_replace(regexp_replace(lower(title), '[^a-z0-9]+', '-', 'g'), '^-+|-+$', '', 'g'), 80), '-+$', '')
         || '-' || split_part(media_id, '-', 2) as u
  from t_all, d
  where ((rn - (d.day * 29) % 3000 + 3000) % 3000) < 45
),
p_all as (
  select person_id, row_number() over (order by fame_rank, person_id) - 1 as rn, count(*) over () as cnt
  from person_index_kept
),
people as (
  select 'https://balasaur.com/person/' || person_id as u
  from p_all, d
  where ((rn - (d.day * 23) % cnt + cnt) % cnt) < 20
),
rotating as (
  select u, 1 as grp, row_number() over () as ord
  from (
    select u from cols
    union all select u from titles
    union all select u from people
  ) r
),
each_once as (
  select distinct on (u) u, grp, ord
  from (select u, grp, ord from panel union all select u, grp, ord from rotating) a
  order by u, grp, ord
)
select array_agg(u order by grp, ord) from each_once;
$$;

-- ---------------------------------------------------------------------------
-- 6. The thirteen lists the trust gate stopped generating
-- ---------------------------------------------------------------------------
-- Each now 404s. A retired slug redirects permanently to its closest parent
-- (the route already consults this table). A genre-on-service list goes to
-- the service list: the visitor's constraint is the service they pay for.
-- Indian action shows goes to Action Shows, not to the Indian shows shelf,
-- because that shelf is built at request time and collections_canary() fails
-- on a redirect to a slug the collections table does not hold. Each row is
-- written only when its target exists and the source is still retired, so
-- the canary stays green either way.
insert into public.collection_redirects (from_slug, to_slug)
select v.from_slug, v.to_slug
from (values
  ('best-horror-movies-on-disney-plus', 'best-movies-on-disney-plus'),
  ('best-thriller-movies-on-disney-plus', 'best-movies-on-disney-plus'),
  ('best-animation-movies-on-apple-tv-plus', 'best-movies-on-apple-tv-plus'),
  ('best-romance-movies-on-apple-tv-plus', 'best-movies-on-apple-tv-plus'),
  ('best-family-movies-on-apple-tv-plus', 'best-movies-on-apple-tv-plus'),
  ('best-documentary-movies-on-peacock', 'best-movies-on-peacock'),
  ('best-indian-action-shows', 'best-action-shows'),
  ('best-shows-of-1984', 'best-shows-of-the-1980s'),
  ('best-shows-of-1986', 'best-shows-of-the-1980s'),
  ('best-shows-of-1987', 'best-shows-of-the-1980s'),
  ('best-shows-of-1989', 'best-shows-of-the-1980s'),
  ('best-shows-of-1990', 'best-shows-of-the-1990s'),
  ('best-shows-of-1991', 'best-shows-of-the-1990s')
) v(from_slug, to_slug)
where exists (select 1 from public.collections c where c.slug = v.to_slug)
  and not exists (select 1 from public.collections c where c.slug = v.from_slug)
on conflict (from_slug) do nothing;

-- ---------------------------------------------------------------------------
-- 7. Index panel rows that fell outside the kept sets
-- ---------------------------------------------------------------------------
-- All 38 panel titles are kept. Two people and six lists are not; each is
-- replaced by a kept URL of the same family. Each swap breaks the run-to-run
-- comparison for its family once.
--
--   person/119143  Kana Hanazawa, fame rank 2,364   -> person/3223 Robert Downey Jr., rank 1
--   person/123813  Ian Anthony Dale, rank 4,191     -> person/1253360 Pedro Pascal, rank 188
--   best-action-movies-on-netflix   (10 of top 10 on a parent) -> best-movies-on-prime
--   best-christopher-nolan-movies   (person list)              -> best-drama-movies
--   best-crime-movies-on-tubi       (10 of 10)                 -> best-movies-on-tubi
--   best-crime-shows-on-hulu        (8 of 10)                  -> best-shows-on-max
--   best-mystery-movies-on-tubi     (9 of 10)                  -> best-crime-movies
--   best-romance-movies-on-tubi     (9 of 10)                  -> best-fantasy-movies-on-tubi
delete from public.index_panel where url in (
  'https://balasaur.com/person/119143',
  'https://balasaur.com/person/123813',
  'https://balasaur.com/best/best-action-movies-on-netflix',
  'https://balasaur.com/best/best-christopher-nolan-movies',
  'https://balasaur.com/best/best-crime-movies-on-tubi',
  'https://balasaur.com/best/best-crime-shows-on-hulu',
  'https://balasaur.com/best/best-mystery-movies-on-tubi',
  'https://balasaur.com/best/best-romance-movies-on-tubi'
);

insert into public.index_panel (url, family, added_on, note) values
  ('https://balasaur.com/person/3223', 'person', '2026-10-16', 'Robert Downey Jr., replaces Kana Hanazawa (not kept)'),
  ('https://balasaur.com/person/1253360', 'person', '2026-10-16', 'Pedro Pascal, replaces Ian Anthony Dale (not kept)'),
  ('https://balasaur.com/best/best-movies-on-prime', 'collection', '2026-10-16', 'service head term, replaces best-action-movies-on-netflix (not kept)'),
  ('https://balasaur.com/best/best-drama-movies', 'collection', '2026-10-16', 'genre head term, replaces best-christopher-nolan-movies (person list)'),
  ('https://balasaur.com/best/best-movies-on-tubi', 'collection', '2026-10-16', 'service list, replaces best-crime-movies-on-tubi (not kept)'),
  ('https://balasaur.com/best/best-shows-on-max', 'collection', '2026-10-16', 'service head term, replaces best-crime-shows-on-hulu (not kept)'),
  ('https://balasaur.com/best/best-crime-movies', 'collection', '2026-10-16', 'genre head term, replaces best-mystery-movies-on-tubi (not kept)'),
  ('https://balasaur.com/best/best-fantasy-movies-on-tubi', 'collection', '2026-10-16', 'kept genre-on-service list, replaces best-romance-movies-on-tubi (not kept)')
on conflict (url) do nothing;

-- Say so if a title or list on the panel is outside its kept set. People are
-- checked in the follow-up, once their set is filled.
do $mig$
declare
  stray text;
begin
  select string_agg(p.url, ', ') into stray
  from public.index_panel p
  where (p.family in ('movie', 'tv')
         and not exists (select 1 from public.index_kept_media k
                         where k.media_id = p.family || '-' || substring(p.url from '(\d+)$')))
     or (p.family = 'collection'
         and not exists (select 1 from public.collection_index_kept k
                         where k.kept and p.url = 'https://balasaur.com/best/' || k.slug));
  if stray is not null then
    raise warning 'index panel rows outside the kept sets: %', stray;
  end if;
end
$mig$;
