-- v10: person collections + origin-genre media-type split.
--
-- People: "Best Tom Holland Movies" mints itself. Admission is by heat (sum
-- of qualifying titles' popularity, so a person trends exactly when their
-- titles do; top 120 with 10+ qualifying titles and heat >= 300); once
-- admitted, a person persists in person_collection_roster and their list
-- lives as long as the quality gate holds, so published URLs never churn
-- with the news cycle. Names come from the stored people jsonb (directors,
-- creators, lead cast), so a list is the person's leading work, not cameos.
-- person_id resolves through person_index (most-credited name wins).
--
-- Origin-genre: split by media type like v8 did for every other family.
-- Unambiguous slugs both ways; the retired merged slug 301s via
-- collection_redirects (Drama pairs point at shows, every other genre at
-- movies, falling back to whichever variant survived the gate). Korean tv
-- drama takes its real category name: best-k-dramas.
--
-- Record of the live change applied 2026-08-19. Verified after the rebuild:
-- 600 collections (126 person, 80 origin-genre, up from 448 total / ~40
-- merged origin-genre), 265 redirects, best-korean-dramas -> best-k-dramas,
-- "The Best K-Dramas" n=60 led by When Life Gives You Tangerines (90),
-- "The Best Tom Holland Movies" n=17, Nolan's list led by The Dark Knight.
-- The full function body below is the live text (see also
-- person_slugs_unaccent, applied the same night).

create table if not exists public.person_collection_roster (
  person_name text primary key,
  person_id bigint,
  added_at timestamptz not null default now()
);
alter table public.person_collection_roster enable row level security;

create or replace function public.rebuild_collections()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
begin
  create temporary table _elig on commit drop as
    select media_id, media_type, title, year, release_date,
           rating_balasaur, quality_score, genres, origins, streaming,
           completion_status, film_length_minutes, awards_won,
           sub_genres, themes, audience, vote_count, seasons, award_nominee,
           popularity, people
    from public.media
    where suggestive = false
      and poster_url is not null
      and overview is not null and overview <> ''
      and rating_balasaur is not null
      and quality_score is not null
      and (coalesce(vote_count, 0) >= 25
           or (rating_imdb is not null
               and (rating_rotten_tomatoes is not null
                    or rating_metacritic is not null
                    or coalesce(popularity, 0) >= 20)));

  create temporary table _defs (
    slug text primary key, kind text, title text, media_type text,
    media_id text[], item_count int, season_months int[], legacy_slug text
  ) on commit drop;

  -- service x type
  insert into _defs (slug, kind, title, media_type, media_id, item_count, legacy_slug)
  select case when x.mt='movie' then 'best-movies-on-' || slugify(x.s)
              else 'best-shows-on-' || slugify(x.s) end,
         'service',
         case when x.mt='movie' then 'The Best Movies on ' else 'The Best Shows on ' end
           || x.s || ' Right Now',
         x.mt,
         array_agg(x.media_id order by x.rating_balasaur desc, x.quality_score desc, x.media_id),
         max(x.cnt)::int,
         case when x.mt='movie' then 'best-on-' || slugify(x.s) else null end
  from (
    select e.media_id, e.media_type mt, e.rating_balasaur, e.quality_score, ss.s,
           row_number() over (partition by ss.s, e.media_type order by e.quality_score desc) rn,
           count(*) over (partition by ss.s, e.media_type) cnt
    from _elig e, unnest(e.streaming) ss(s)
    where ss.s in ('Netflix','Max','Prime','Disney+','Apple TV+','Hulu','Paramount+','Peacock','Tubi')
  ) x where x.rn <= 60
  group by 1,2,3,4,7 having max(x.cnt) >= 20
  on conflict (slug) do nothing;

  -- genre x service x type
  insert into _defs (slug, kind, title, media_type, media_id, item_count, legacy_slug)
  select case when x.mt='movie' then 'best-' || slugify(x.g) || '-movies-on-' || slugify(x.s)
              else 'best-' || slugify(x.g) || '-shows-on-' || slugify(x.s) end,
         'genre-service',
         x.g || case when x.mt='movie' then ' Movies on ' else ' Shows on ' end || x.s || ', Ranked',
         x.mt,
         array_agg(x.media_id order by x.rating_balasaur desc, x.quality_score desc, x.media_id),
         max(x.cnt)::int,
         case when x.mt='movie' then 'best-' || slugify(x.g) || '-on-' || slugify(x.s) else null end
  from (
    select e.media_id, e.media_type mt, e.rating_balasaur, e.quality_score, gg.g, ss.s,
           row_number() over (partition by gg.g, ss.s, e.media_type order by e.quality_score desc) rn,
           count(*) over (partition by gg.g, ss.s, e.media_type) cnt
    from _elig e, unnest(e.genres) gg(g), unnest(e.streaming) ss(s)
    where ss.s in ('Netflix','Max','Prime','Disney+','Apple TV+','Hulu','Paramount+','Peacock','Tubi')
      and gg.g in ('Drama','Comedy','Action','Thriller','Crime','Horror','Science Fiction',
                   'Romance','Mystery','Fantasy','Animation','Documentary','Adventure','Family')
  ) x where x.rn <= 60
  group by 1,2,3,4,7 having max(x.cnt) >= 15
  on conflict (slug) do nothing;

  -- genre x type
  insert into _defs (slug, kind, title, media_type, media_id, item_count, legacy_slug)
  select case when x.mt='movie' then 'best-' || slugify(x.g) || '-movies'
              else 'best-' || slugify(x.g) || '-shows' end,
         'genre',
         'The Best ' || x.g || case when x.mt='movie' then ' Movies' else ' Shows' end
           || ' of All Time',
         x.mt,
         array_agg(x.media_id order by x.rating_balasaur desc, x.quality_score desc, x.media_id),
         max(x.cnt)::int,
         case when x.mt='movie' then 'best-' || slugify(x.g) else null end
  from (
    select e.media_id, e.media_type mt, e.rating_balasaur, e.quality_score, gg.g,
           row_number() over (partition by gg.g, e.media_type order by e.quality_score desc) rn,
           count(*) over (partition by gg.g, e.media_type) cnt
    from _elig e, unnest(e.genres) gg(g)
    where gg.g in ('Drama','Comedy','Action','Thriller','Crime','Horror','Science Fiction',
                   'Romance','Mystery','Fantasy','Animation','Documentary','Adventure','Family','War','Western')
  ) x where x.rn <= 60
  group by 1,2,3,4,7 having max(x.cnt) >= 30
  on conflict (slug) do nothing;

  -- decade x type
  insert into _defs (slug, kind, title, media_type, media_id, item_count, legacy_slug)
  select case when x.mt='movie' then 'best-movies-of-the-' || x.dec
              else 'best-shows-of-the-' || x.dec end,
         'decade',
         case when x.mt='movie' then 'The Best Movies of the ' else 'The Best Shows of the ' end || x.dec,
         x.mt,
         array_agg(x.media_id order by x.rating_balasaur desc, x.quality_score desc, x.media_id),
         max(x.cnt)::int,
         case when x.mt='movie' then 'best-of-the-' || x.dec else null end
  from (
    select e.media_id, e.media_type mt, e.rating_balasaur, e.quality_score,
           substring(e.year from 1 for 3) || '0s' as dec,
           row_number() over (partition by substring(e.year from 1 for 3), e.media_type order by e.quality_score desc) rn,
           count(*) over (partition by substring(e.year from 1 for 3), e.media_type) cnt
    from _elig e where e.year ~ '^\d{4}$' and e.year >= '1950'
  ) x where x.rn <= 60
  group by 1,2,3,4,7 having max(x.cnt) >= 30
  on conflict (slug) do nothing;

  -- year x type
  insert into _defs (slug, kind, title, media_type, media_id, item_count, legacy_slug)
  select case when x.mt='movie' then 'best-movies-of-' || x.yr else 'best-shows-of-' || x.yr end,
         'year',
         case when x.mt='movie' then 'The Best Movies of ' else 'The Best Shows of ' end || x.yr,
         x.mt,
         array_agg(x.media_id order by x.rating_balasaur desc, x.quality_score desc, x.media_id),
         max(x.cnt)::int,
         case when x.mt='movie' then 'best-of-' || x.yr else null end
  from (
    select e.media_id, e.media_type mt, e.year yr, e.rating_balasaur, e.quality_score,
           row_number() over (partition by e.year, e.media_type order by e.quality_score desc) rn,
           count(*) over (partition by e.year, e.media_type) cnt
    from _elig e
    where e.year ~ '^\d{4}$' and e.year >= '1960' and e.year <= to_char(now(), 'YYYY')
  ) x where x.rn <= 60
  group by 1,2,3,4,7 having max(x.cnt) >= 40
  on conflict (slug) do nothing;

  -- origin x genre, split by media type (v10). Unambiguous slugs both ways;
  -- the retired merged slug 301s below. Korean tv drama takes its real
  -- category name.
  insert into _defs (slug, kind, title, media_type, media_id, item_count, legacy_slug)
  select case
           when x.o = 'Korean' and x.g = 'Drama' and x.mt = 'tv' then 'best-k-dramas'
           when x.mt = 'movie' then 'best-' || slugify(x.o) || '-' || slugify(x.g) || '-movies'
           else 'best-' || slugify(x.o) || '-' || slugify(x.g) || '-shows' end,
         'origin-genre',
         case
           when x.o = 'Korean' and x.g = 'Drama' and x.mt = 'tv' then 'The Best K-Dramas'
           when x.mt = 'movie' then 'The Best ' || x.o || ' ' || x.g || ' Movies'
           else 'The Best ' || x.o || ' ' || x.g || ' Shows' end,
         x.mt,
         array_agg(x.media_id order by x.rating_balasaur desc, x.quality_score desc, x.media_id),
         max(x.cnt)::int,
         'best-' || slugify(x.o) || '-' || slugify(genre_plural(x.g))
  from (
    select t.media_id, t.mt, t.o, t.g, t.rating_balasaur, t.quality_score,
           row_number() over (partition by t.o, t.g, t.mt order by t.quality_score desc) rn,
           count(*) over (partition by t.o, t.g, t.mt) cnt
    from (select e.media_id, e.media_type mt, e.quality_score, e.rating_balasaur,
                 unnest(e.origins) o, unnest(e.genres) g
          from _elig e) t
    where t.o in ('Korean','Japanese','Chinese','Indian','French','Spanish','British')
      and t.g in ('Drama','Comedy','Action','Thriller','Crime','Horror','Romance','Animation')
  ) x where x.rn <= 60
  group by 1,2,3,4,7 having max(x.cnt) >= 12
  on conflict (slug) do nothing;

  -- Each retired merged slug redirects to exactly one surviving variant:
  -- Drama pairs prefer shows, every other genre movies; when the preferred
  -- variant did not survive the gate, the survivor keeps the redirect.
  update _defs d set legacy_slug = null
  where d.kind = 'origin-genre' and d.legacy_slug is not null
    and exists (select 1 from _defs o
                where o.kind = 'origin-genre' and o.legacy_slug = d.legacy_slug and o.slug <> d.slug)
    and d.media_type <> (case when d.legacy_slug like '%-dramas' then 'tv' else 'movie' end);

  -- discovery shelves that used to exist only as homepage rails
  insert into _defs (slug, kind, title, media_type, media_id, item_count)
  select 'new-and-noteworthy', 'discovery', 'New and Noteworthy', null,
         array_agg(media_id order by rating_balasaur desc, quality_score desc, media_id), max(cnt)::int
  from (
    select e.media_id, e.rating_balasaur, e.quality_score,
           row_number() over (order by e.quality_score desc) rn, count(*) over () cnt
    from _elig e
    where e.release_date is not null
      and e.release_date >= to_char(now() - interval '75 days', 'YYYY-MM-DD')
      and e.release_date <= to_char(now(), 'YYYY-MM-DD')
  ) t where rn <= 60 having max(cnt) >= 20
  on conflict (slug) do nothing;

  insert into _defs (slug, kind, title, media_type, media_id, item_count)
  select 'hidden-gems', 'discovery', 'Hidden Gems', null,
         array_agg(media_id order by rating_balasaur desc, quality_score desc, media_id), max(cnt)::int
  from (
    select e.media_id, e.rating_balasaur, e.quality_score,
           row_number() over (order by e.quality_score desc) rn, count(*) over () cnt
    from _elig e
    where e.rating_balasaur >= 75 and coalesce(e.popularity, 0) < 12
  ) t where rn <= 60 having max(cnt) >= 20
  on conflict (slug) do nothing;

  insert into _defs (slug, kind, title, media_type, media_id, item_count)
  select 'completed-tv-shows-worth-binging', 'discovery', 'Completed TV Shows Worth Binging', 'tv',
         array_agg(media_id order by rating_balasaur desc, quality_score desc, media_id), max(cnt)::int
  from (
    select e.media_id, e.rating_balasaur, e.quality_score,
           row_number() over (order by e.quality_score desc) rn, count(*) over () cnt
    from _elig e where e.media_type = 'tv' and e.completion_status = 'Ended'
  ) t where rn <= 60 having max(cnt) >= 20
  on conflict (slug) do nothing;

  insert into _defs (slug, kind, title, media_type, media_id, item_count)
  select 'great-movies-under-90-minutes', 'discovery', 'Great Movies Under 90 Minutes', 'movie',
         array_agg(media_id order by rating_balasaur desc, quality_score desc, media_id), max(cnt)::int
  from (
    select e.media_id, e.rating_balasaur, e.quality_score,
           row_number() over (order by e.quality_score desc) rn, count(*) over () cnt
    from _elig e where e.media_type = 'movie' and e.film_length_minutes between 1 and 89
  ) t where rn <= 60 having max(cnt) >= 20
  on conflict (slug) do nothing;

  -- awards already split naturally by ceremony
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

  -- occasions: each recipe declares its media type
  for r in select * from public.collection_recipes where active order by sort_order loop
    insert into _defs (slug, kind, title, media_type, media_id, item_count, season_months)
    select r.slug, 'occasion', r.title, r.criteria->>'media_type',
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

  -- people (v10): admission by heat, persistence by roster + quality gate.
  insert into public.person_collection_roster (person_name, person_id)
  select t.name, pi.person_id
  from (
    select p->>'name' as name, sum(coalesce(e.popularity,0)) as heat, count(*) as titles
    from _elig e, jsonb_array_elements(coalesce(e.people,'[]'::jsonb)) p
    where coalesce(p->>'name','') <> ''
    group by 1
  ) t
  left join lateral (select person_id from public.person_index pi
                     where pi.name = t.name order by pi.titles desc limit 1) pi on true
  where t.titles >= 10 and t.heat >= 300
  order by t.heat desc
  limit 120
  on conflict (person_name) do nothing;

  insert into _defs (slug, kind, title, media_type, media_id, item_count)
  select case when x.mt = 'movie' then 'best-' || slugify(x.name) || '-movies'
              else 'best-' || slugify(x.name) || '-shows' end,
         'person',
         'The Best ' || x.name || case when x.mt = 'movie' then ' Movies' else ' Shows' end,
         x.mt,
         array_agg(x.media_id order by x.rating_balasaur desc, x.quality_score desc, x.media_id),
         max(x.cnt)::int
  from (
    select e.media_id, e.media_type mt, e.rating_balasaur, e.quality_score, r2.person_name as name,
           row_number() over (partition by r2.person_name, e.media_type order by e.quality_score desc) rn,
           count(*) over (partition by r2.person_name, e.media_type) cnt
    from _elig e
    join lateral jsonb_array_elements(coalesce(e.people,'[]'::jsonb)) p on true
    join public.person_collection_roster r2 on r2.person_name = p->>'name'
  ) x where x.rn <= 60
  group by 1,2,3,4 having max(x.cnt) >= 10
  on conflict (slug) do nothing;

  -- ---- materialize ----
  delete from public.collection_items;
  delete from public.collections;

  insert into public.collections
    (slug, kind, title, item_count, poster_ids, season_months, media_type, updated_at)
  select d.slug, d.kind, d.title, d.item_count, d.media_id[1:5], d.season_months, d.media_type, now()
  from _defs d;

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

  update public.collections c
  set item_count = s.n
  from (select slug, count(*)::int as n from public.collection_items group by slug) s
  where s.slug = c.slug;

  -- Retired slugs keep resolving. Never points at a slug that does not exist.
  delete from public.collection_redirects;
  insert into public.collection_redirects (from_slug, to_slug)
  select d.legacy_slug, d.slug
  from _defs d
  where d.legacy_slug is not null
    and not exists (select 1 from _defs d2 where d2.slug = d.legacy_slug)
  on conflict (from_slug) do nothing;

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
$function$;
