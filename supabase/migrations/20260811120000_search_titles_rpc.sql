-- Top-bar title search, upgraded from bare `ilike + popularity` to an RPC:
--  1. Typo tolerance: trigram similarity (`%` operator, backed by the existing
--     idx_media_title_trgm index) so "Severence" still finds Severance.
--  2. Substring matches always rank above similarity-only matches.
--  3. `sensitive` titles are DEMOTED below clean matches, not hidden — search
--     is the deliberate lookup path and must keep everything findable.
--  4. Ties break on the blended rank_score, not raw popularity.
-- Called by the service role only (searchTitles server fn), but granted to
-- browser roles like the other read RPCs in case client-side search returns.

create or replace function public.search_titles(p_q text)
returns table (
  media_id text,
  media_type text,
  title text,
  year text,
  poster_url text,
  rating_imdb double precision,
  rating_rotten_tomatoes integer,
  rating_metacritic integer,
  rating_tmdb double precision
)
language sql
stable
as $$
  select
    m.media_id,
    m.media_type,
    m.title,
    m.year,
    m.poster_url,
    m.rating_imdb::double precision,
    m.rating_rotten_tomatoes::integer,
    m.rating_metacritic::integer,
    m.rating_tmdb::double precision
  from public.media m
  where m.title ilike '%' || p_q || '%'
     or m.title % p_q
  order by
    (m.title ilike '%' || p_q || '%') desc,
    coalesce(m.sensitive, false) asc,
    similarity(m.title, p_q) desc,
    m.rank_score desc nulls last
  limit 10
$$;

grant execute on function public.search_titles(text) to anon, authenticated;
