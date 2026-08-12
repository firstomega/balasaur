-- Collections: programmatically minted ranked-list pages (/best/<slug>).
--
-- Nobody hand-curates these. rebuild_collections() runs a combinatorial
-- matrix (service, genre×service, genre, decade, genre×decade, year,
-- origin×genre, completion, runtime, awards) and a combo becomes a page ONLY
-- if it passes the quality gate: enough titles that are rich enough to stand
-- alone (poster + overview + score + quality rank, never sensitive). The gate
-- is the curator — thin combos simply never exist, which is the anti-spam /
-- anti-thin-content property AdSense and Google care about.
--
-- The function materializes stats (count / top / median / newest / collage
-- poster ids) + the top-60 ranked items per collection. The prose dek is
-- composed at render time in TS (src/lib/collectionsProse.ts) from these
-- stats — deterministic data-prose, no LLM freeform.
--
-- Nightly refresh via pg_cron (availability + scores drift daily).

create extension if not exists pg_cron;

create table if not exists public.collections (
  slug text primary key,
  kind text not null,
  title text not null,
  item_count int not null,
  top_score int,
  median_score int,
  newest_title text,
  newest_date text,
  poster_ids text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.collection_items (
  slug text not null references public.collections (slug) on delete cascade,
  media_id text not null,
  rank int not null,
  primary key (slug, media_id)
);
create index if not exists idx_collection_items_media on public.collection_items (media_id);

alter table public.collections enable row level security;
alter table public.collection_items enable row level security;
drop policy if exists "collections are public" on public.collections;
create policy "collections are public" on public.collections for select using (true);
drop policy if exists "collection items are public" on public.collection_items;
create policy "collection items are public" on public.collection_items for select using (true);
grant select on public.collections, public.collection_items to anon, authenticated;

-- "Science Fiction" -> "science-fiction", "Apple TV+" -> "apple-tv-plus"
create or replace function public.slugify(t text) returns text
language sql immutable as $$
  select trim(both '-' from regexp_replace(
    replace(replace(lower(t), '+', '-plus'), '&', 'and'),
    '[^a-z0-9]+', '-', 'g'))
$$;

-- Genre display plurals for titles ("Thriller" -> "Thrillers", mass nouns stay).
create or replace function public.genre_plural(g text) returns text
language sql immutable as $$
  select case g
    when 'Thriller' then 'Thrillers'
    when 'Comedy' then 'Comedies'
    when 'Drama' then 'Dramas'
    when 'Mystery' then 'Mysteries'
    when 'Documentary' then 'Documentaries'
    when 'Western' then 'Westerns'
    else g  -- Horror, Action, Science Fiction, Romance, Crime, Fantasy, Animation, Adventure, Family, War
  end
$$;

create or replace function public.rebuild_collections() returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  -- Eligible titles: the same richness bar the sitemap uses.
  create temporary table _elig on commit drop as
    select media_id, media_type, title, year, release_date,
           rating_balasaur, quality_score, genres, origins, streaming,
           completion_status, film_length_minutes, awards_won
    from public.media
    where sensitive = false
      and poster_url is not null
      and overview is not null and overview <> ''
      and rating_balasaur is not null
      and quality_score is not null;

  create temporary table _defs (
    slug text primary key,
    kind text,
    title text,
    media_id text[],   -- ranked, capped at 60
    item_count int
  ) on commit drop;

  -- Each kind uses the same shape: explode -> window-rank per group -> keep
  -- rank<=60 -> aggregate. (Aggregating whole groups into arrays first blew
  -- memory/time on 20k-title genres.) The HAVING clause is the quality gate.

  -- service · gate >= 20
  insert into _defs
  select 'best-on-' || slugify(s), 'service', 'The Best on ' || s || ' Right Now',
         array_agg(media_id order by rn), max(cnt)::int
  from (
    select x.media_id, x.s,
           row_number() over (partition by x.s order by x.quality_score desc) rn,
           count(*) over (partition by x.s) cnt
    from (select e.media_id, e.quality_score, unnest(e.streaming) s from _elig e) x
    where x.s in ('Netflix','Max','Prime','Disney+','Apple TV+','Hulu','Paramount+','Peacock','Tubi')
  ) t where rn <= 60
  group by s having max(cnt) >= 20
  on conflict (slug) do nothing;

  -- genre-service · gate >= 15
  insert into _defs
  select 'best-' || slugify(g) || '-on-' || slugify(s), 'genre-service',
         genre_plural(g) || ' on ' || s || ', Ranked',
         array_agg(media_id order by rn), max(cnt)::int
  from (
    select x.media_id, x.g, x.s,
           row_number() over (partition by x.g, x.s order by x.quality_score desc) rn,
           count(*) over (partition by x.g, x.s) cnt
    from (select e.media_id, e.quality_score, unnest(e.genres) g, unnest(e.streaming) s from _elig e) x
    where x.s in ('Netflix','Max','Prime','Disney+','Apple TV+','Hulu','Paramount+','Peacock','Tubi')
      and x.g in ('Drama','Comedy','Action','Thriller','Crime','Horror','Science Fiction',
                  'Romance','Mystery','Fantasy','Animation','Documentary','Adventure','Family')
  ) t where rn <= 60
  group by g, s having max(cnt) >= 15
  on conflict (slug) do nothing;

  -- genre · gate >= 30
  insert into _defs
  select 'best-' || slugify(g), 'genre', 'The Best ' || genre_plural(g) || ' of All Time',
         array_agg(media_id order by rn), max(cnt)::int
  from (
    select x.media_id, x.g,
           row_number() over (partition by x.g order by x.quality_score desc) rn,
           count(*) over (partition by x.g) cnt
    from (select e.media_id, e.quality_score, unnest(e.genres) g from _elig e) x
    where x.g in ('Drama','Comedy','Action','Thriller','Crime','Horror','Science Fiction',
                  'Romance','Mystery','Fantasy','Animation','Documentary','Adventure','Family','War','Western')
  ) t where rn <= 60
  group by g having max(cnt) >= 30
  on conflict (slug) do nothing;

  -- decade · gate >= 30
  insert into _defs
  select 'best-of-the-' || dec, 'decade', 'The Best of the ' || dec,
         array_agg(media_id order by rn), max(cnt)::int
  from (
    select x.media_id, x.dec,
           row_number() over (partition by x.dec order by x.quality_score desc) rn,
           count(*) over (partition by x.dec) cnt
    from (select e.media_id, e.quality_score, substring(e.year from 1 for 3) || '0s' as dec
          from _elig e where e.year ~ '^\d{4}$' and e.year >= '1950') x
  ) t where rn <= 60
  group by dec having max(cnt) >= 30
  on conflict (slug) do nothing;

  -- genre-decade · gate >= 15
  insert into _defs
  select 'best-' || dec || '-' || slugify(g), 'genre-decade',
         dec || ' ' || genre_plural(g) || ', Ranked',
         array_agg(media_id order by rn), max(cnt)::int
  from (
    select x.media_id, x.g, x.dec,
           row_number() over (partition by x.g, x.dec order by x.quality_score desc) rn,
           count(*) over (partition by x.g, x.dec) cnt
    from (select e.media_id, e.quality_score, unnest(e.genres) g,
                 substring(e.year from 1 for 3) || '0s' as dec
          from _elig e where e.year ~ '^\d{4}$' and e.year >= '1950') x
    where x.g in ('Drama','Comedy','Action','Thriller','Crime','Horror','Science Fiction',
                  'Romance','Mystery','Fantasy','Animation','Documentary')
  ) t where rn <= 60
  group by dec, g having max(cnt) >= 15
  on conflict (slug) do nothing;

  -- year · gate >= 40
  insert into _defs
  select 'best-of-' || yr, 'year', 'The Best of ' || yr,
         array_agg(media_id order by rn), max(cnt)::int
  from (
    select e.media_id, e.year as yr,
           row_number() over (partition by e.year order by e.quality_score desc) rn,
           count(*) over (partition by e.year) cnt
    from _elig e
    where e.year ~ '^\d{4}$' and e.year >= '1960' and e.year <= to_char(now(), 'YYYY')
  ) t where rn <= 60
  group by yr having max(cnt) >= 40
  on conflict (slug) do nothing;

  -- origin-genre · gate >= 12
  insert into _defs
  select 'best-' || slugify(o) || '-' || slugify(genre_plural(g)), 'origin-genre',
         'The Best ' || o || ' ' || genre_plural(g),
         array_agg(media_id order by rn), max(cnt)::int
  from (
    select x.media_id, x.o, x.g,
           row_number() over (partition by x.o, x.g order by x.quality_score desc) rn,
           count(*) over (partition by x.o, x.g) cnt
    from (select e.media_id, e.quality_score, unnest(e.origins) o, unnest(e.genres) g from _elig e) x
    where x.o in ('Korean','Japanese','Chinese','Indian','French','Spanish','British')
      and x.g in ('Drama','Comedy','Action','Thriller','Crime','Horror','Romance','Animation')
  ) t where rn <= 60
  group by o, g having max(cnt) >= 12
  on conflict (slug) do nothing;

  -- discovery: completed TV · gate >= 20
  insert into _defs
  select 'completed-tv-shows-worth-binging', 'discovery', 'Completed TV Shows Worth Binging',
         array_agg(media_id order by rn), max(cnt)::int
  from (
    select e.media_id,
           row_number() over (order by e.quality_score desc) rn,
           count(*) over () cnt
    from _elig e where e.media_type = 'tv' and e.completion_status = 'Ended'
  ) t where rn <= 60
  having max(cnt) >= 20
  on conflict (slug) do nothing;

  -- discovery: under 90 minutes · gate >= 20
  insert into _defs
  select 'great-movies-under-90-minutes', 'discovery', 'Great Movies Under 90 Minutes',
         array_agg(media_id order by rn), max(cnt)::int
  from (
    select e.media_id,
           row_number() over (order by e.quality_score desc) rn,
           count(*) over () cnt
    from _elig e where e.media_type = 'movie' and e.film_length_minutes between 1 and 89
  ) t where rn <= 60
  having max(cnt) >= 20
  on conflict (slug) do nothing;

  -- awards · gate >= 10
  insert into _defs
  select 'best-' || slugify(label) || '-winners', 'awards', label || ' Winners, Ranked',
         array_agg(media_id order by rn), max(cnt)::int
  from (
    select x.media_id, x.label,
           row_number() over (partition by x.label order by x.quality_score desc) rn,
           count(*) over (partition by x.label) cnt
    from (
      select e.media_id, e.quality_score,
             case a when 'oscar' then 'Oscar' when 'emmy' then 'Emmy'
                    when 'globe' then 'Golden Globe' when 'bafta' then 'BAFTA' end as label
      from _elig e, unnest(e.awards_won) a
      where a in ('oscar','emmy','globe','bafta')
    ) x
  ) t where rn <= 60
  group by label having max(cnt) >= 10
  on conflict (slug) do nothing;

  -- ---- materialize: full replace keeps slugs stable, stats fresh ----
  delete from public.collection_items;
  delete from public.collections;

  insert into public.collections
    (slug, kind, title, item_count, poster_ids, updated_at)
  select d.slug, d.kind, d.title, d.item_count, d.media_id[1:4], now()
  from _defs d;

  insert into public.collection_items (slug, media_id, rank)
  select d.slug, m.media_id, m.ord
  from _defs d, unnest(d.media_id) with ordinality as m (media_id, ord);

  -- Stats over the SHOWN shelf (top 60) via one grouped join — cheap.
  update public.collections c
  set top_score = s.top, median_score = s.med
  from (
    select ci.slug, max(e.rating_balasaur) as top,
           round(percentile_cont(0.5) within group (order by e.rating_balasaur))::int as med
    from public.collection_items ci
    join _elig e on e.media_id = ci.media_id
    group by ci.slug
  ) s where s.slug = c.slug;

  update public.collections c
  set newest_title = n.title, newest_date = n.release_date
  from (
    select distinct on (ci.slug) ci.slug, e.title, e.release_date
    from public.collection_items ci
    join _elig e on e.media_id = ci.media_id
    where e.release_date is not null and e.release_date <= to_char(now(), 'YYYY-MM-DD')
    order by ci.slug, e.release_date desc
  ) n where n.slug = c.slug;
end
$fn$;

-- Seed + nightly schedule are applied as separate statements (the seed is too
-- heavy to share a 60s window with the DDL):
--   select public.rebuild_collections();
--   select cron.schedule('rebuild-collections', '20 9 * * *',
--                        'select public.rebuild_collections()');
