-- Fix: catalog_facets_filtered errored at RUNTIME on every call with
--   "0A000: CREATE TABLE AS is not allowed in a non-volatile function"
-- because it was declared STABLE but built a temp table. Postgres forbids
-- CREATE TABLE (incl. temp) inside a non-volatile function. The temp table only
-- existed to compute the filtered set once and reuse it across the facet counts.
-- A MATERIALIZED CTE does exactly that while keeping the function STABLE (read-only),
-- so the rail's genre + origin counts finally compute instead of failing soft to 0.
--
-- Logic is otherwise identical to 20260602190000 (region-aware streaming included).

create or replace function public.catalog_facets_filtered(p jsonb)
returns json
language plpgsql
stable
as $$
declare
  v_types     text[] := array(select jsonb_array_elements_text(coalesce(p->'types', '[]'::jsonb)));
  v_genres    text[] := array(select jsonb_array_elements_text(coalesce(p->'genres', '[]'::jsonb)));
  v_origins   text[] := array(select jsonb_array_elements_text(coalesce(p->'origins', '[]'::jsonb)));
  v_streaming text[] := array(select jsonb_array_elements_text(coalesce(p->'streaming', '[]'::jsonb)));
  v_people    text[] := array(select jsonb_array_elements_text(coalesce(p->'people', '[]'::jsonb)));
  v_region    text   := upper(coalesce(p->>'region', 'US'));
  v_stream_tok text[] := array(select s || ':' || v_region from unnest(v_streaming) s);
  v_year_min  text   := p->>'year_min';
  v_year_max  text   := p->>'year_max';
  v_imdb_min  numeric := coalesce((p->>'imdb_min')::numeric, 0);
  v_imdb_max  numeric := coalesce((p->>'imdb_max')::numeric, 10);
  v_imdb_un   boolean := coalesce((p->>'imdb_unrated')::boolean, true);
  v_rt_min    numeric := coalesce((p->>'rt_min')::numeric, 0);
  v_rt_max    numeric := coalesce((p->>'rt_max')::numeric, 100);
  v_rt_un     boolean := coalesce((p->>'rt_unrated')::boolean, true);
  v_meta_min  numeric := coalesce((p->>'meta_min')::numeric, 0);
  v_meta_max  numeric := coalesce((p->>'meta_max')::numeric, 100);
  v_meta_un   boolean := coalesce((p->>'meta_unrated')::boolean, true);
  v_win       boolean := coalesce((p->>'award_winners')::boolean, false);
  v_nom       boolean := coalesce((p->>'nominated')::boolean, false);
  v_people_j  jsonb   := (select jsonb_agg(jsonb_build_object('name', n)) from unnest(v_people) n);
  result json;
begin
  with _facet_common as materialized (
    select genres, origins, rating_imdb, rating_rotten_tomatoes, rating_metacritic
    from public.media
    where (cardinality(v_types) = 0 or media_type = any (v_types))
      and (cardinality(v_streaming) = 0 or streaming_regions && v_stream_tok)
      and (
        v_year_min is null or v_year_max is null
        or (year >= v_year_min and year <= v_year_max)
      )
      and (
        case when v_imdb_un then (rating_imdb is null or rating_imdb between v_imdb_min and v_imdb_max)
             else (rating_imdb is not null and rating_imdb between v_imdb_min and v_imdb_max) end
      )
      and (
        case when v_rt_un then (rating_rotten_tomatoes is null or rating_rotten_tomatoes between v_rt_min and v_rt_max)
             else (rating_rotten_tomatoes is not null and rating_rotten_tomatoes between v_rt_min and v_rt_max) end
      )
      and (
        case when v_meta_un then (rating_metacritic is null or rating_metacritic between v_meta_min and v_meta_max)
             else (rating_metacritic is not null and rating_metacritic between v_meta_min and v_meta_max) end
      )
      and (not v_win or award_winner = true)
      and (not v_nom or (award_nominee or award_winner))
      and (v_people_j is null or people @> v_people_j)
  )
  select json_build_object(
    'genres', (
      select coalesce(json_object_agg(g, c), '{}'::json)
      from (
        select unnest(genres) as g, count(*) as c
        from _facet_common
        where (cardinality(v_origins) = 0 or origins && v_origins)
        group by 1
      ) t
    ),
    'origins', (
      select coalesce(json_object_agg(o, c), '{}'::json)
      from (
        select unnest(origins) as o, count(*) as c
        from _facet_common
        where (cardinality(v_genres) = 0 or genres && v_genres)
        group by 1
      ) t
    ),
    'total', (
      select count(*) from _facet_common
      where (cardinality(v_genres) = 0 or genres && v_genres)
        and (cardinality(v_origins) = 0 or origins && v_origins)
    ),
    'tagged', (
      select count(*) from _facet_common
      where (cardinality(v_genres) = 0 or genres && v_genres)
        and coalesce(array_length(origins, 1), 0) > 0
    ),
    'scored', json_build_object(
      'imdb', (select count(*) from _facet_common where (cardinality(v_genres) = 0 or genres && v_genres) and (cardinality(v_origins) = 0 or origins && v_origins) and rating_imdb is not null),
      'rt',   (select count(*) from _facet_common where (cardinality(v_genres) = 0 or genres && v_genres) and (cardinality(v_origins) = 0 or origins && v_origins) and rating_rotten_tomatoes is not null),
      'meta', (select count(*) from _facet_common where (cardinality(v_genres) = 0 or genres && v_genres) and (cardinality(v_origins) = 0 or origins && v_origins) and rating_metacritic is not null)
    )
  ) into result;

  return result;
end
$$;

grant execute on function public.catalog_facets_filtered(jsonb) to anon, authenticated;
