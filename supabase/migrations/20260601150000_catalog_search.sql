-- Server-side catalog browsing. The homepage no longer ships the whole catalog to
-- the browser; it queries the DB a page at a time. These indexes make the filter +
-- sort + search fast at any catalog size, and the two helper functions feed the
-- filter rail (facet stats) and the "by person" search without loading everything.

create extension if not exists pg_trgm;

-- Array filters (genre / origin / streaming use "overlaps").
create index if not exists idx_media_genres on public.media using gin (genres);
create index if not exists idx_media_origins on public.media using gin (origins);
create index if not exists idx_media_streaming on public.media using gin (streaming);

-- Cast containment (people @> [{"name": ...}]) and fuzzy cast/title search.
create index if not exists idx_media_people on public.media using gin (people jsonb_path_ops);
create index if not exists idx_media_people_text on public.media using gin ((people::text) gin_trgm_ops);
create index if not exists idx_media_title_trgm on public.media using gin (title gin_trgm_ops);

-- Sort keys.
create index if not exists idx_media_popularity on public.media (popularity desc nulls last);
create index if not exists idx_media_rating_imdb on public.media (rating_imdb desc nulls last);
create index if not exists idx_media_year on public.media (year desc nulls last);

-- ---------------------------------------------------------------------------
-- catalog_facets(): global stats for the filter rail (origin counts, how many
-- titles carry each rating, totals). Cheap aggregates, cached client-side. Global
-- (not per-active-filter) for v1 — enough to show real numbers and grey out
-- origins with no data.
-- ---------------------------------------------------------------------------
create or replace function public.catalog_facets()
returns json
language sql
stable
as $$
  select json_build_object(
    'total', (select count(*) from public.media),
    'tagged', (select count(*) from public.media where coalesce(array_length(origins, 1), 0) > 0),
    'origins', (
      select coalesce(json_object_agg(o, c), '{}'::json)
      from (
        select unnest(origins) as o, count(*) as c
        from public.media
        where origins is not null
        group by 1
      ) t
    ),
    'scored', json_build_object(
      'imdb', (select count(*) from public.media where rating_imdb is not null),
      'rt', (select count(*) from public.media where rating_rotten_tomatoes is not null),
      'meta', (select count(*) from public.media where rating_metacritic is not null)
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- search_cast(): up to 8 distinct cast/crew names matching a query, for the rail's
-- "By Person" typeahead. The people::text trigram index narrows rows before we
-- unnest the JSONB.
-- ---------------------------------------------------------------------------
create or replace function public.search_cast(p_q text, p_exclude text[] default '{}')
returns table (name text)
language sql
stable
as $$
  select distinct elem->>'name' as name
  from public.media m,
       lateral jsonb_array_elements(m.people) elem
  where m.people is not null
    and p_q <> ''
    and m.people::text ilike '%' || p_q || '%'
    and elem->>'name' ilike '%' || p_q || '%'
    and lower(elem->>'name') <> all (select lower(x) from unnest(p_exclude) x)
  order by 1
  limit 8;
$$;

grant execute on function public.catalog_facets() to anon, authenticated;
grant execute on function public.search_cast(text, text[]) to anon, authenticated;
