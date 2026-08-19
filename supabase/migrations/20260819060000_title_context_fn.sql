-- Per-title context for the data-prose layer: where the title sits inside its
-- own genre-and-decade cohort, and inside its franchise. Both are claims only
-- this database can make, computed from scored titles (the same population
-- the printed scores come from). Record of the live change applied
-- 2026-08-19; verified: Inception = 99th percentile of 2,072 2010s action
-- movies; The Godfather = franchise rank 1 of 3 and 99th of 740 1970s
-- drama movies.
create or replace function public.title_context(p_media_id text)
returns table (
  cohort_label text, cohort_size integer, percentile integer,
  franchise_size integer, franchise_rank integer
)
language sql stable
set search_path = public
as $$
with anchor as (
  select m.media_id, m.media_type, m.rating_balasaur, m.tmdb_collection_id,
         nullif(m.year,'') as yr,
         (select g from unnest(m.genres) g limit 1) as primary_genre
  from media m where m.media_id = p_media_id
),
cohort as (
  select count(*) as n,
         count(*) filter (where m.rating_balasaur < a.rating_balasaur) as below
  from media m, anchor a
  where a.rating_balasaur is not null
    and a.primary_genre is not null
    and a.yr ~ '^\d{4}$'
    and m.media_type = a.media_type
    and m.rating_balasaur is not null
    and a.primary_genre = any(m.genres)
    and substring(m.year from 1 for 3) = substring(a.yr from 1 for 3)
),
franchise as (
  select count(*) as n,
         count(*) filter (where m.rating_balasaur > a.rating_balasaur) as above
  from media m, anchor a
  where a.tmdb_collection_id is not null
    and m.tmdb_collection_id = a.tmdb_collection_id
    and m.rating_balasaur is not null
)
select
  case when a.primary_genre is not null and a.yr ~ '^\d{4}$'
       then substring(a.yr from 1 for 3) || '0s ' || lower(a.primary_genre)
            || case when a.media_type = 'tv' then ' shows' else ' movies' end
       end as cohort_label,
  c.n::int as cohort_size,
  case when c.n > 0 then round(100.0 * c.below / c.n)::int end as percentile,
  f.n::int as franchise_size,
  case when f.n > 0 then (f.above + 1)::int end as franchise_rank
from anchor a
cross join cohort c
cross join franchise f
$$;

revoke execute on function public.title_context(text) from public, anon, authenticated;
