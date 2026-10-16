-- Search dropdown: a score badge only when the title page would show one.
--
-- NOT YET APPLIED. Written 2026-10-16 for the owner to apply to the live
-- project: the drop below waits for a confirmation the query tool cannot
-- give. The site works before and after it. Until it runs, search rows carry
-- no vote count and the dropdown keeps applying only the source rule.
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
-- with CREATE OR REPLACE, so the function is dropped and created again.
--
-- What it hides, read 2026-10-16: 20,525 titles with two sources and fewer
-- than 10 votes lose the dropdown badge (their pages already show none). Top
-- by popularity: Barbara Karlich - Talk um 4, Resident Dead, Volle Kanne,
-- Hollywood Squares (1998), DAS!, ZIBB, Morgenmagazin, 7de Laan. Every title
-- stays findable; only the number goes.

drop function if exists public.search_titles(text);

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
