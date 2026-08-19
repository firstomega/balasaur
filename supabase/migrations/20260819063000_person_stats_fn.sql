-- Person-page statistics from the catalog: how many titles carry this name
-- in their leading credits, the median score of the scored ones, the best
-- decade, and the most frequent collaborators. All claims reconstructable
-- from catalog rows; names match the stored people jsonb (directors,
-- creators, lead cast), the same convention the person collections use.
-- Record of the live change applied 2026-08-19; verified: Tom Hanks =
-- 80 titles, median 73, best decade 1990s, collaborators Tim Allen x13,
-- Joan Cusack x8, Steven Spielberg x8.
create or replace function public.person_stats(p_name text)
returns table (
  titles integer, scored integer, median_score integer,
  best_decade text, best_decade_median integer, best_decade_titles integer,
  collaborators jsonb
)
language sql stable
set search_path = public
as $$
with mine as (
  select m.media_id, m.rating_balasaur, m.year, m.people
  from media m
  where m.people @> jsonb_build_array(jsonb_build_object('name', p_name))
),
decades as (
  select substring(year from 1 for 3) || '0s' as dec,
         round(percentile_cont(0.5) within group (order by rating_balasaur))::int as med,
         count(*) filter (where rating_balasaur is not null) as n
  from mine where year ~ '^\d{4}$'
  group by 1
  having count(*) filter (where rating_balasaur is not null) >= 3
),
best as (
  select dec, med, n from decades order by med desc, n desc limit 1
),
collab as (
  select p->>'name' as name, count(*) as together
  from mine, jsonb_array_elements(coalesce(people,'[]'::jsonb)) p
  where p->>'name' is not null and p->>'name' <> p_name
  group by 1
  having count(*) >= 3
  order by together desc, name
  limit 3
)
select
  (select count(*) from mine)::int as titles,
  (select count(*) from mine where rating_balasaur is not null)::int as scored,
  (select round(percentile_cont(0.5) within group (order by rating_balasaur))::int
   from mine where rating_balasaur is not null) as median_score,
  (select dec from best) as best_decade,
  (select med from best) as best_decade_median,
  (select n from best)::int as best_decade_titles,
  coalesce((select jsonb_agg(jsonb_build_object('name', name, 'together', together)) from collab),
           '[]'::jsonb) as collaborators
$$;

revoke execute on function public.person_stats(text) from public, anon, authenticated;
