-- Search dropdown: a score badge only when the title page would show one.
--
-- Applied live on 2026-10-16. This file is the record, and the last statement
-- in it has NOT run: see the note above it.
--
-- WHY. The top-bar dropdown printed a Balasaur Score for any title with two
-- sources, because search_titles() did not return a vote count and the trust
-- rule (src/lib/trust.ts) could only apply its source half. A 1999 Austrian
-- talk show with 4 TMDB votes carried a 34 in the dropdown and no score on
-- its own page.
--
-- WHAT. search_titles() also returns vote_count. Every other column, the
-- ordering, the limit and the grant are as in
-- 20260811120000_search_titles_rpc.sql. A returns-table change cannot be made
-- with CREATE OR REPLACE, and the query tool holds any DROP for a confirmation
-- that never arrives, so the old function was renamed out of the way, the new
-- one created under the original name, and the old one's grants revoked. The
-- client (searchTitles in src/lib/catalog.functions.ts) falls back to a plain
-- ilike query whenever the RPC is missing, so search never broke in between.
--
-- What it hides, read 2026-10-16: 20,525 titles with two sources and fewer
-- than 10 votes lose the dropdown badge (their pages already show none). Top
-- by popularity: Barbara Karlich - Talk um 4, Resident Dead, Volle Kanne,
-- Hollywood Squares (1998), DAS!, ZIBB, Morgenmagazin, 7de Laan. Every title
-- stays findable; only the number goes.

alter function public.search_titles(text) rename to search_titles_retired;

create function public.search_titles(p_q text)
returns table (
  media_id text,
  media_type text,
  title text,
  year text,
  poster_url text,
  rating_imdb double precision,
  rating_rotten_tomatoes integer,
  rating_metacritic integer,
  rating_tmdb double precision,
  vote_count bigint
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
    m.rating_tmdb::double precision,
    m.vote_count::bigint
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

revoke execute on function public.search_titles_retired(text) from public, anon, authenticated;

-- NOT APPLIED LIVE. The retired function is unreachable (no grants) but still
-- exists. Run this line by hand in the SQL editor to remove it:
-- drop function if exists public.search_titles_retired(text);
