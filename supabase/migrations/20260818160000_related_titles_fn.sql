-- Similarity engine, first principles. One candidate must EARN its place:
--   franchise membership and shared people count most, then sub-genres (x3),
--   themes (x2), genres (x1), and a small same-era bonus. The Balasaur Score
--   is a quality floor, not a proximity target. Audience compatibility is a
--   hard wall: a Kids/Family anchor only accepts titles with positive
--   kid-safe evidence, Kids-audience titles only appear under Kids/Family
--   anchors, and fan-service (`suggestive`) titles never appear anywhere.
-- Returns shared facets per row so the UI can print WHY each card is here.
--
-- Record of the live function as of 2026-08-18 (applied as
-- related_titles_fn + related_titles_fn_teen_wall; this file carries the
-- final text). Verified live: The Godfather -> Parts II/III first (franchise),
-- then Pacino/mob titles; Sesame Street -> The Muppet Show (Frank Oz) and
-- kids programming, no fan-service anime; worst-case timing 376ms, and the
-- result is cached in media_cache (7 days) + CDN (6h).
create or replace function public.related_titles(p_media_id text, p_target_type text)
returns table (
  media_id text, media_type text, title text, year text, poster_url text,
  popularity double precision, rating_imdb double precision,
  rating_rotten_tomatoes integer, rating_metacritic integer,
  rating_tmdb double precision, rating_balasaur integer,
  genres text[], seasons jsonb, award_winner boolean, award_nominee boolean,
  match_score integer, same_franchise boolean,
  shared_people text[], shared_sub_genres text[], shared_themes text[],
  shared_genres text[], era_match boolean
)
language sql stable
set search_path = public
as $$
with anchor as (
  select m.media_id, m.genres, m.sub_genres, m.themes, m.audience,
         m.rating_balasaur, nullif(m.year,'')::int as yr, m.tmdb_collection_id,
         coalesce((select array_agg(p->>'name')
                   from jsonb_array_elements(coalesce(m.people,'[]'::jsonb)) p
                   where p->>'name' is not null), '{}'::text[]) as people_names,
         (m.audience && array['Kids','Family']
            and not (m.audience && array['Adult','Mature'])) as kid_anchor,
         (m.audience @> array['Teen']) as teen_anchor,
         case when m.rating_balasaur is null then 55
              else greatest(40, least(m.rating_balasaur - 15, 65)) end as floor_score
  from media m where m.media_id = p_media_id
),
scored as (
  select m.media_id, m.media_type, m.title, m.year, m.poster_url, m.popularity,
         m.rating_imdb, m.rating_rotten_tomatoes, m.rating_metacritic,
         m.rating_tmdb, m.rating_balasaur, m.genres, m.seasons,
         m.award_winner, m.award_nominee, m.quality_score,
         (a.tmdb_collection_id is not null
            and m.tmdb_collection_id = a.tmdb_collection_id) as same_franchise,
         coalesce((select array_agg(p->>'name')
                   from jsonb_array_elements(coalesce(m.people,'[]'::jsonb)) p
                   where p->>'name' = any(a.people_names)), '{}'::text[]) as shared_people,
         coalesce((select array_agg(x) from unnest(m.sub_genres) x
                   where x = any(a.sub_genres)), '{}'::text[]) as shared_sub_genres,
         coalesce((select array_agg(x) from unnest(m.themes) x
                   where x = any(a.themes)), '{}'::text[]) as shared_themes,
         coalesce((select array_agg(x) from unnest(m.genres) x
                   where x = any(a.genres)), '{}'::text[]) as shared_genres,
         (a.yr is not null and nullif(m.year,'') is not null
            and abs(nullif(m.year,'')::int - a.yr) <= 10) as era_match
  from media m, anchor a
  where m.media_type = p_target_type
    and m.media_id <> a.media_id
    and m.suggestive = false
    and m.sensitive = false
    and m.poster_url is not null
    and m.rating_balasaur >= a.floor_score
    and (m.genres && a.genres or m.sub_genres && a.sub_genres or m.themes && a.themes
         or (a.tmdb_collection_id is not null and m.tmdb_collection_id = a.tmdb_collection_id))
    and (not a.kid_anchor
         or (m.audience && array['Kids','Family','Teen']
             and not (m.audience && array['Adult','Mature'])))
    and (a.kid_anchor or not a.teen_anchor or not (m.audience @> array['Mature']))
    and (a.kid_anchor or not (m.audience @> array['Kids']))
)
select s.media_id, s.media_type, s.title, s.year, s.poster_url, s.popularity,
       s.rating_imdb, s.rating_rotten_tomatoes, s.rating_metacritic,
       s.rating_tmdb, s.rating_balasaur, s.genres, s.seasons,
       s.award_winner, s.award_nominee,
       (case when s.same_franchise then 10 else 0 end
        + least(cardinality(s.shared_people), 2) * 4
        + cardinality(s.shared_sub_genres) * 3
        + cardinality(s.shared_themes) * 2
        + cardinality(s.shared_genres)
        + case when s.era_match then 1 else 0 end)::int as match_score,
       s.same_franchise, s.shared_people, s.shared_sub_genres, s.shared_themes,
       s.shared_genres, s.era_match
from scored s
order by match_score desc, s.rating_balasaur desc nulls last,
         s.quality_score desc nulls last, s.popularity desc nulls last
limit 40
$$;

revoke execute on function public.related_titles(text, text) from public, anon, authenticated;
