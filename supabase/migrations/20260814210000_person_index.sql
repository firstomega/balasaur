-- Applied to the live project 2026-08-14. This file is the record, not the
-- source of truth (Lovable Cloud does not auto-apply repo migrations).
--
-- People with a real footprint in the indexable catalog: top-8 billing or a
-- directing credit, counted across indexable titles only, so the same
-- corroboration philosophy that gates titles gates people. Two consumers:
-- top-search person hits (titles >= 3, 7,983 people) and the person sitemap
-- (titles >= 8, 1,861 people). Materialized because the aggregation walks the
-- credits of 17,735 titles; refreshed nightly.
create materialized view public.person_index as
with credits as (
  select (p->>'id')::bigint as person_id,
         p->>'name' as name,
         p->>'profile_path' as profile_path
  from public.indexable_media m,
       jsonb_array_elements(coalesce(m.raw_tmdb->'credits'->'cast','[]'::jsonb)) p
  where (p->>'order')::int < 8
  union all
  select (p->>'id')::bigint, p->>'name', p->>'profile_path'
  from public.indexable_media m,
       jsonb_array_elements(coalesce(m.raw_tmdb->'credits'->'crew','[]'::jsonb)) p
  where p->>'job' = 'Director'
)
select person_id,
       min(name) as name,
       min(profile_path) filter (where profile_path is not null) as profile_path,
       count(*)::int as titles
from credits
where person_id is not null
group by person_id
having count(*) >= 3;

create unique index person_index_person_id on public.person_index (person_id);
create index person_index_titles on public.person_index (titles desc);

revoke all on public.person_index from anon, authenticated;
grant select on public.person_index to service_role;

-- Search over the view for the top-bar dropdown. Prefix matches first, then
-- by footprint, so "tom holl" puts the actor above the namesake director.
create or replace function public.search_persons(p_q text)
returns table (person_id bigint, name text, profile_path text, titles int)
language sql
stable
security definer
set search_path = public
as $$
  select person_id, name, profile_path, titles
  from public.person_index
  where name ilike '%' || p_q || '%'
  order by (name ilike p_q || '%') desc, titles desc, name
  limit 5;
$$;

revoke all on function public.search_persons(text) from public, anon, authenticated;

-- Nightly refresh between the collections rebuild (09:20) and the IndexNow
-- ping (09:40). Concurrent refresh needs the unique index above.
-- select cron.schedule('person-index-refresh', '30 9 * * *',
--   $$refresh materialized view concurrently public.person_index$$);
