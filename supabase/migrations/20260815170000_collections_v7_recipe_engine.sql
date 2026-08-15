-- Applied to the live project 2026-08-15. This file is the record, not the
-- source of truth (Lovable Cloud does not auto-apply repo migrations).
--
-- v7: the recipe engine. Adds a tenth collection kind, 'occasion', whose
-- definitions live in public.collection_recipes as data rather than as nine
-- more hardcoded INSERT blocks. The loop applies each recipe's `criteria`
-- generically. No dynamic SQL: criteria are read with jsonb operators, so a
-- malformed recipe can only fail to match, never inject.
--
-- The full function body as applied is reproduced below. It is the v6 body
-- with three changes: _elig gains the facet columns the predicate reads
-- (sub_genres, themes, audience, vote_count, seasons, award_nominee), _defs
-- gains season_months, and the recipe loop runs after the nine fixed kinds.
--
-- Rebuilt live: 384 collections, 30 of them occasions.

create or replace function public.rebuild_collections() returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r record;
begin
  -- Eligible titles: the same richness bar the sitemap uses.
  create temporary table _elig on commit drop as
    select media_id, media_type, title, year, release_date,
           rating_balasaur, quality_score, genres, origins, streaming,
           completion_status, film_length_minutes, awards_won,
           sub_genres, themes, audience, vote_count, seasons, award_nominee
    from public.media
    where sensitive = false
      and poster_url is not null
      and overview is not null and overview <> ''
      and rating_balasaur is not null
      and quality_score is not null
      -- v5 corroboration gate: a lone 10.0 from a handful of TMDB voters (or
      -- a single-source IMDb 10 on an obscure title) must not top a list.
      -- Eligible = real vote volume, OR IMDb corroborated by a second critic
      -- source, OR IMDb on a title with real popularity. The pool regrows
      -- automatically as the nightly refresh heals vote_count.
      and (coalesce(vote_count, 0) >= 25
           or (rating_imdb is not null
               and (rating_rotten_tomatoes is not null
                    or rating_metacritic is not null
                    or coalesce(popularity, 0) >= 20)));

  create temporary table _defs (
    slug text primary key,
    kind text,
    title text,
    media_id text[],   -- ranked, capped at 60
    item_count int,
    season_months int[]
  ) on commit drop;

  -- Each kind uses the same shape: explode -> window-rank per group -> keep
  -- rank<=60 -> aggregate. (Aggregating whole groups into arrays first blew
  -- memory/time on 20k-title genres.) The HAVING clause is the quality gate.

  -- service · gate >= 20
  insert into _defs (slug, kind, title, media_id, item_count)
  select 'best-on-' || slugify(s), 'service', 'The Best on ' || s || ' Right Now',
         array_agg(media_id order by rating_balasaur desc, quality_score desc, media_id), max(cnt)::int
  from (
    select x.media_id, x.s, x.rating_balasaur, x.quality_score,
           row_number() over (partition by x.s order by x.quality_score desc) rn,
           count(*) over (partition by x.s) cnt
    from (select e.media_id, e.quality_score, e.rating_balasaur, unnest(e.streaming) s from _elig e) x
    where x.s in ('Netflix','Max','Prime','Disney+','Apple TV+','Hulu','Paramount+','Peacock','Tubi')
  ) t where rn <= 60
  group by s having max(cnt) >= 20
  on conflict (slug) do nothing;

  -- genre-service · gate >= 15
  insert into _defs (slug, kind, title, media_id, item_count)
  select 'best-' || slugify(g) || '-on-' || slugify(s), 'genre-service',
         genre_plural(g) || ' on ' || s || ', Ranked',
         array_agg(media_id order by rating_balasaur desc, quality_score desc, media_id), max(cnt)::int
  from (
    select x.media_id, x.g, x.s, x.rating_balasaur, x.quality_score,
           row_number() over (partition by x.g, x.s order by x.quality_score desc) rn,
           count(*) over (partition by x.g, x.s) cnt
    from (select e.media_id, e.quality_score, e.rating_balasaur, unnest(e.genres) g, unnest(e.streaming) s from _elig e) x
    where x.s in ('Netflix','Max','Prime','Disney+','Apple TV+','Hulu','Paramount+','Peacock','Tubi')
      and x.g in ('Drama','Comedy','Action','Thriller','Crime','Horror','Science Fiction',
                  'Romance','Mystery','Fantasy','Animation','Documentary','Adventure','Family')
  ) t where rn <= 60
  group by g, s having max(cnt) >= 15
  on conflict (slug) do nothing;

  -- genre · gate >= 30
  insert into _defs (slug, kind, title, media_id, item_count)
  select 'best-' || slugify(g), 'genre', 'The Best ' || genre_plural(g) || ' of All Time',
         array_agg(media_id order by rating_balasaur desc, quality_score desc, media_id), max(cnt)::int
  from (
    select x.media_id, x.g, x.rating_balasaur, x.quality_score,
           row_number() over (partition by x.g order by x.quality_score desc) rn,
           count(*) over (partition by x.g) cnt
    from (select e.media_id, e.quality_score, e.rating_balasaur, unnest(e.genres) g from _elig e) x
    where x.g in ('Drama','Comedy','Action','Thriller','Crime','Horror','Science Fiction',
                  'Romance','Mystery','Fantasy','Animation','Documentary','Adventure','Family','War','Western')
  ) t where rn <= 60
  group by g having max(cnt) >= 30
  on conflict (slug) do nothing;

  -- decade · gate >= 30
  insert into _defs (slug, kind, title, media_id, item_count)
  select 'best-of-the-' || dec, 'decade', 'The Best of the ' || dec,
         array_agg(media_id order by rating_balasaur desc, quality_score desc, media_id), max(cnt)::int
  from (
    select x.media_id, x.dec, x.rating_balasaur, x.quality_score,
           row_number() over (partition by x.dec order by x.quality_score desc) rn,
           count(*) over (partition by x.dec) cnt
    from (select e.media_id, e.quality_score, e.rating_balasaur, substring(e.year from 1 for 3) || '0s' as dec
          from _elig e where e.year ~ '^\d{4}$' and e.year >= '1950') x
  ) t where rn <= 60
  group by dec having max(cnt) >= 30
  on conflict (slug) do nothing;

  -- genre-decade · gate >= 15
  insert into _defs (slug, kind, title, media_id, item_count)
  select 'best-' || dec || '-' || slugify(g), 'genre-decade',
         dec || ' ' || genre_plural(g) || ', Ranked',
         array_agg(media_id order by rating_balasaur desc, quality_score desc, media_id), max(cnt)::int
  from (
    select x.media_id, x.g, x.dec, x.rating_balasaur, x.quality_score,
           row_number() over (partition by x.g, x.dec order by x.quality_score desc) rn,
           count(*) over (partition by x.g, x.dec) cnt
    from (select e.media_id, e.quality_score, e.rating_balasaur, unnest(e.genres) g,
                 substring(e.year from 1 for 3) || '0s' as dec
          from _elig e where e.year ~ '^\d{4}$' and e.year >= '1950') x
    where x.g in ('Drama','Comedy','Action','Thriller','Crime','Horror','Science Fiction',
                  'Romance','Mystery','Fantasy','Animation','Documentary')
  ) t where rn <= 60
  group by dec, g having max(cnt) >= 15
  on conflict (slug) do nothing;

  -- year · gate >= 40
  insert into _defs (slug, kind, title, media_id, item_count)
  select 'best-of-' || yr, 'year', 'The Best of ' || yr,
         array_agg(media_id order by rating_balasaur desc, quality_score desc, media_id), max(cnt)::int
  from (
    select e.media_id, e.year as yr, e.rating_balasaur, e.quality_score,
           row_number() over (partition by e.year order by e.quality_score desc) rn,
           count(*) over (partition by e.year) cnt
    from _elig e
    where e.year ~ '^\d{4}$' and e.year >= '1960' and e.year <= to_char(now(), 'YYYY')
  ) t where rn <= 60
  group by yr having max(cnt) >= 40
  on conflict (slug) do nothing;

  -- origin-genre · gate >= 12
  insert into _defs (slug, kind, title, media_id, item_count)
  select 'best-' || slugify(o) || '-' || slugify(genre_plural(g)), 'origin-genre',
         'The Best ' || o || ' ' || genre_plural(g),
         array_agg(media_id order by rating_balasaur desc, quality_score desc, media_id), max(cnt)::int
  from (
    select x.media_id, x.o, x.g, x.rating_balasaur, x.quality_score,
           row_number() over (partition by x.o, x.g order by x.quality_score desc) rn,
           count(*) over (partition by x.o, x.g) cnt
    from (select e.media_id, e.quality_score, e.rating_balasaur, unnest(e.origins) o, unnest(e.genres) g from _elig e) x
    where x.o in ('Korean','Japanese','Chinese','Indian','French','Spanish','British')
      and x.g in ('Drama','Comedy','Action','Thriller','Crime','Horror','Romance','Animation')
  ) t where rn <= 60
  group by o, g having max(cnt) >= 12
  on conflict (slug) do nothing;

  -- discovery: completed TV · gate >= 20
  insert into _defs (slug, kind, title, media_id, item_count)
  select 'completed-tv-shows-worth-binging', 'discovery', 'Completed TV Shows Worth Binging',
         array_agg(media_id order by rating_balasaur desc, quality_score desc, media_id), max(cnt)::int
  from (
    select e.media_id, e.rating_balasaur, e.quality_score,
           row_number() over (order by e.quality_score desc) rn,
           count(*) over () cnt
    from _elig e where e.media_type = 'tv' and e.completion_status = 'Ended'
  ) t where rn <= 60
  having max(cnt) >= 20
  on conflict (slug) do nothing;

  -- discovery: under 90 minutes · gate >= 20
  insert into _defs (slug, kind, title, media_id, item_count)
  select 'great-movies-under-90-minutes', 'discovery', 'Great Movies Under 90 Minutes',
         array_agg(media_id order by rating_balasaur desc, quality_score desc, media_id), max(cnt)::int
  from (
    select e.media_id, e.rating_balasaur, e.quality_score,
           row_number() over (order by e.quality_score desc) rn,
           count(*) over () cnt
    from _elig e where e.media_type = 'movie' and e.film_length_minutes between 1 and 89
  ) t where rn <= 60
  having max(cnt) >= 20
  on conflict (slug) do nothing;

  -- awards · gate >= 10
  insert into _defs (slug, kind, title, media_id, item_count)
  select 'best-' || slugify(label) || '-winners', 'awards', label || ' Winners, Ranked',
         array_agg(media_id order by rating_balasaur desc, quality_score desc, media_id), max(cnt)::int
  from (
    select x.media_id, x.label, x.rating_balasaur, x.quality_score,
           row_number() over (partition by x.label order by x.quality_score desc) rn,
           count(*) over (partition by x.label) cnt
    from (
      select e.media_id, e.quality_score, e.rating_balasaur,
             case a when 'oscar' then 'Oscar' when 'emmy' then 'Emmy'
                    when 'globe' then 'Golden Globe' when 'bafta' then 'BAFTA' end as label
      from _elig e, unnest(e.awards_won) a
      where a in ('oscar','emmy','globe','bafta')
    ) x
  ) t where rn <= 60
  group by label having max(cnt) >= 10
  on conflict (slug) do nothing;

  -- ---- occasion kind: one pass per recipe row ----
  for r in select * from public.collection_recipes where active order by sort_order loop
    insert into _defs (slug, kind, title, media_id, item_count, season_months)
    select r.slug, 'occasion', r.title,
           array_agg(media_id order by rating_balasaur desc, quality_score desc, media_id),
           max(cnt)::int, r.season_months
    from (
      select e.media_id, e.rating_balasaur, e.quality_score,
             row_number() over (order by e.quality_score desc) rn,
             count(*) over () cnt
      from _elig e
      where (r.criteria->>'media_type' is null or e.media_type = r.criteria->>'media_type')
        and (r.criteria->>'score_min' is null or e.rating_balasaur >= (r.criteria->>'score_min')::int)
        and (r.criteria->>'votes_min' is null or coalesce(e.vote_count,0) >= (r.criteria->>'votes_min')::int)
        and (r.criteria->>'runtime_min' is null or e.film_length_minutes >= (r.criteria->>'runtime_min')::int)
        and (r.criteria->>'runtime_max' is null or e.film_length_minutes <= (r.criteria->>'runtime_max')::int)
        and (r.criteria->>'year_min' is null or (e.year ~ '^\d{4}$' and e.year >= r.criteria->>'year_min'))
        and (r.criteria->>'year_max' is null or (e.year ~ '^\d{4}$' and e.year <= r.criteria->>'year_max'))
        -- every genre group must be satisfied by at least one genre
        and (r.criteria->'genre_groups' is null or not exists (
              select 1 from jsonb_array_elements(r.criteria->'genre_groups') gg
              where not (coalesce(e.genres,'{}') && array(select jsonb_array_elements_text(gg)))))
        and (r.criteria->'sub_genres_any' is null
             or coalesce(e.sub_genres,'{}') && array(select jsonb_array_elements_text(r.criteria->'sub_genres_any')))
        and (r.criteria->'themes_any' is null
             or coalesce(e.themes,'{}') && array(select jsonb_array_elements_text(r.criteria->'themes_any')))
        and (r.criteria->'audience_any' is null
             or coalesce(e.audience,'{}') && array(select jsonb_array_elements_text(r.criteria->'audience_any')))
        and (r.criteria->'exclude_genres' is null
             or not (coalesce(e.genres,'{}') && array(select jsonb_array_elements_text(r.criteria->'exclude_genres'))))
        and (r.criteria->'exclude_sub_genres' is null
             or not (coalesce(e.sub_genres,'{}') && array(select jsonb_array_elements_text(r.criteria->'exclude_sub_genres'))))
        and (r.criteria->'exclude_audience' is null
             or not (coalesce(e.audience,'{}') && array(select jsonb_array_elements_text(r.criteria->'exclude_audience'))))
        and (r.criteria->'completion_any' is null
             or e.completion_status = any(array(select jsonb_array_elements_text(r.criteria->'completion_any'))))
        -- seasons_min guards the missing-data case: a show with no season
        -- array has length 0 and would otherwise pass "one season or fewer".
        and (r.criteria->>'seasons_min' is null
             or jsonb_array_length(coalesce(e.seasons,'[]'::jsonb)) >= (r.criteria->>'seasons_min')::int)
        and (r.criteria->>'seasons_max' is null
             or jsonb_array_length(coalesce(e.seasons,'[]'::jsonb)) <= (r.criteria->>'seasons_max')::int)
        and (r.criteria->>'award_nominee_within_years' is null
             or (e.award_nominee and e.year ~ '^\d{4}$'
                 and e.year::int >= extract(year from now())::int - (r.criteria->>'award_nominee_within_years')::int))
    ) t where rn <= 60
    having max(cnt) >= r.min_items
    on conflict (slug) do nothing;
  end loop;

  -- ---- materialize: full replace keeps slugs stable, stats fresh ----
  delete from public.collection_items;
  delete from public.collections;

  insert into public.collections
    (slug, kind, title, item_count, poster_ids, season_months, updated_at)
  -- Top FIVE covers: the hub's featured cards fan five posters.
  select d.slug, d.kind, d.title, d.item_count, d.media_id[1:5], d.season_months, now()
  from _defs d;

  -- The list ends where its quality falls off: always keep the top 12, then
  -- keep titles scoring within 25 points of the shelf's leader, cap 60. The
  -- arrays are ordered by displayed score, so the kept set is a prefix and
  -- ordinality remains the displayed rank. Strong shelves stay long, thin
  -- shelves stop instead of padding with 59-score filler.
  insert into public.collection_items (slug, media_id, rank)
  select slug, media_id, ord
  from (
    select d.slug, m.media_id, m.ord, e.rating_balasaur,
           first_value(e.rating_balasaur) over (partition by d.slug order by m.ord) as leader
    from _defs d
    cross join unnest(d.media_id) with ordinality as m (media_id, ord)
    join _elig e on e.media_id = m.media_id
  ) t
  where ord <= 12 or rating_balasaur >= leader - 25;

  -- item_count is the SHOWN list length. It is printed in the page title, the
  -- title chip, the dek, and JSON-LD numberOfItems; before this it held the
  -- eligible-pool size, so every shelf with a pool over 60 overstated itself.
  update public.collections c
  set item_count = s.n
  from (select slug, count(*)::int as n from public.collection_items group by slug) s
  where s.slug = c.slug;

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
  set top_titles = s.tt
  from (
    select ci.slug,
           jsonb_agg(jsonb_build_object('title', e.title, 'score', e.rating_balasaur)
                     order by ci.rank) as tt
    from public.collection_items ci
    join _elig e on e.media_id = ci.media_id
    where ci.rank <= 3
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