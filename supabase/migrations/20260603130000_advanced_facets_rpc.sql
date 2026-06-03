-- Advanced facets: extend catalog_facets_filtered to also return dead-end-aware counts
-- for sub_genres, themes, audience, completion_status, and film-length buckets.
-- Same materialized-CTE pattern as 20260602200000 (kept STABLE / read-only): `_base`
-- applies the non-faceted filters once; `_f` precomputes each row's per-facet match
-- flag; then each facet count applies every OTHER facet's flag (so a facet ignores its
-- own selection — the standard for multi-select counts). The TV-only (completion) and
-- movie-only (film length) facets mirror queryCatalog's pass-through (the other media
-- type is not excluded by them).
--
-- NOTE FOR DB CO-PILOT: please run `select public.catalog_facets_filtered('{}'::jsonb)`
-- and a filtered example on the live DB to confirm it executes before publishing.

create or replace function public.catalog_facets_filtered(p jsonb)
returns json
language plpgsql
stable
as $$
declare
  v_types      text[] := array(select jsonb_array_elements_text(coalesce(p->'types', '[]'::jsonb)));
  v_genres     text[] := array(select jsonb_array_elements_text(coalesce(p->'genres', '[]'::jsonb)));
  v_origins    text[] := array(select jsonb_array_elements_text(coalesce(p->'origins', '[]'::jsonb)));
  v_subgenres  text[] := array(select jsonb_array_elements_text(coalesce(p->'sub_genres', '[]'::jsonb)));
  v_themes     text[] := array(select jsonb_array_elements_text(coalesce(p->'themes', '[]'::jsonb)));
  v_audience   text[] := array(select jsonb_array_elements_text(coalesce(p->'audience', '[]'::jsonb)));
  v_completion text[] := array(select jsonb_array_elements_text(coalesce(p->'completion', '[]'::jsonb)));
  v_film       text[] := array(select jsonb_array_elements_text(coalesce(p->'film_length', '[]'::jsonb)));
  v_streaming  text[] := array(select jsonb_array_elements_text(coalesce(p->'streaming', '[]'::jsonb)));
  v_people     text[] := array(select jsonb_array_elements_text(coalesce(p->'people', '[]'::jsonb)));
  v_region     text   := upper(coalesce(p->>'region', 'US'));
  v_stream_tok text[] := array(select s || ':' || v_region from unnest(v_streaming) s);
  v_year_min   text   := p->>'year_min';
  v_year_max   text   := p->>'year_max';
  v_imdb_min   numeric := coalesce((p->>'imdb_min')::numeric, 0);
  v_imdb_max   numeric := coalesce((p->>'imdb_max')::numeric, 10);
  v_imdb_un    boolean := coalesce((p->>'imdb_unrated')::boolean, true);
  v_rt_min     numeric := coalesce((p->>'rt_min')::numeric, 0);
  v_rt_max     numeric := coalesce((p->>'rt_max')::numeric, 100);
  v_rt_un      boolean := coalesce((p->>'rt_unrated')::boolean, true);
  v_meta_min   numeric := coalesce((p->>'meta_min')::numeric, 0);
  v_meta_max   numeric := coalesce((p->>'meta_max')::numeric, 100);
  v_meta_un    boolean := coalesce((p->>'meta_unrated')::boolean, true);
  v_win        boolean := coalesce((p->>'award_winners')::boolean, false);
  v_nom        boolean := coalesce((p->>'nominated')::boolean, false);
  v_people_j   jsonb   := (select jsonb_agg(jsonb_build_object('name', n)) from unnest(v_people) n);
  result json;
begin
  with _base as materialized (
    select media_type, genres, origins, sub_genres, themes, audience,
           completion_status, film_length_minutes,
           rating_imdb, rating_rotten_tomatoes, rating_metacritic
    from public.media
    where (cardinality(v_types) = 0 or media_type = any (v_types))
      and (cardinality(v_streaming) = 0 or streaming_regions && v_stream_tok)
      and (v_year_min is null or v_year_max is null or (year >= v_year_min and year <= v_year_max))
      and (case when v_imdb_un then (rating_imdb is null or rating_imdb between v_imdb_min and v_imdb_max)
                else (rating_imdb is not null and rating_imdb between v_imdb_min and v_imdb_max) end)
      and (case when v_rt_un then (rating_rotten_tomatoes is null or rating_rotten_tomatoes between v_rt_min and v_rt_max)
                else (rating_rotten_tomatoes is not null and rating_rotten_tomatoes between v_rt_min and v_rt_max) end)
      and (case when v_meta_un then (rating_metacritic is null or rating_metacritic between v_meta_min and v_meta_max)
                else (rating_metacritic is not null and rating_metacritic between v_meta_min and v_meta_max) end)
      and (not v_win or award_winner = true)
      and (not v_nom or (award_nominee or award_winner))
      and (v_people_j is null or people @> v_people_j)
  ),
  _f as materialized (
    select b.*,
      (cardinality(v_genres) = 0     or genres && v_genres)        as m_g,
      (cardinality(v_origins) = 0    or origins && v_origins)      as m_o,
      (cardinality(v_subgenres) = 0  or sub_genres && v_subgenres) as m_sg,
      (cardinality(v_themes) = 0     or themes && v_themes)        as m_th,
      (cardinality(v_audience) = 0   or audience && v_audience)    as m_au,
      (cardinality(v_completion) = 0 or media_type = 'movie' or completion_status = any (v_completion)) as m_cs,
      (cardinality(v_film) = 0 or media_type = 'tv' or (
         ('short'   = any (v_film) and film_length_minutes between 0 and 89) or
         ('feature' = any (v_film) and film_length_minutes between 90 and 119) or
         ('long'    = any (v_film) and film_length_minutes between 120 and 149) or
         ('epic'    = any (v_film) and film_length_minutes >= 150)
      )) as m_fl
    from _base b
  )
  select json_build_object(
    'genres', (select coalesce(json_object_agg(g, c), '{}'::json) from (
      select unnest(genres) g, count(*) c from _f
      where m_o and m_sg and m_th and m_au and m_cs and m_fl group by 1) t),
    'origins', (select coalesce(json_object_agg(o, c), '{}'::json) from (
      select unnest(origins) o, count(*) c from _f
      where m_g and m_sg and m_th and m_au and m_cs and m_fl group by 1) t),
    'subGenres', (select coalesce(json_object_agg(sg, c), '{}'::json) from (
      select unnest(sub_genres) sg, count(*) c from _f
      where m_g and m_o and m_th and m_au and m_cs and m_fl group by 1) t),
    'themes', (select coalesce(json_object_agg(th, c), '{}'::json) from (
      select unnest(themes) th, count(*) c from _f
      where m_g and m_o and m_sg and m_au and m_cs and m_fl group by 1) t),
    'audience', (select coalesce(json_object_agg(au, c), '{}'::json) from (
      select unnest(audience) au, count(*) c from _f
      where m_g and m_o and m_sg and m_th and m_cs and m_fl group by 1) t),
    'completion', (select coalesce(json_object_agg(cs, c), '{}'::json) from (
      select completion_status cs, count(*) c from _f
      where completion_status is not null and m_g and m_o and m_sg and m_th and m_au and m_fl group by 1) t),
    'filmLength', (select coalesce(json_object_agg(bucket, c), '{}'::json) from (
      select case when film_length_minutes < 90  then 'short'
                  when film_length_minutes < 120 then 'feature'
                  when film_length_minutes < 150 then 'long'
                  else 'epic' end as bucket,
             count(*) c
      from _f
      where film_length_minutes is not null and m_g and m_o and m_sg and m_th and m_au and m_cs group by 1) t),
    'total', (select count(*) from _f where m_g and m_o and m_sg and m_th and m_au and m_cs and m_fl),
    'tagged', (select count(*) from _f
      where m_g and m_o and m_sg and m_th and m_au and m_cs and m_fl and coalesce(array_length(origins, 1), 0) > 0),
    'scored', json_build_object(
      'imdb', (select count(*) from _f where m_g and m_o and m_sg and m_th and m_au and m_cs and m_fl and rating_imdb is not null),
      'rt',   (select count(*) from _f where m_g and m_o and m_sg and m_th and m_au and m_cs and m_fl and rating_rotten_tomatoes is not null),
      'meta', (select count(*) from _f where m_g and m_o and m_sg and m_th and m_au and m_cs and m_fl and rating_metacritic is not null)
    )
  ) into result;

  return result;
end
$$;

grant execute on function public.catalog_facets_filtered(jsonb) to anon, authenticated;
