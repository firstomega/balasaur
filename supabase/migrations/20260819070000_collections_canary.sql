-- Ranking canary: runs right after the nightly rebuild and raises when a
-- published list stops being explainable from what it prints. A red cron run
-- beats a visitor noticing #1 below #2. Checks:
--   1. display order is monotonic in the printed Balasaur Score
--   2. every list's top item is corroborated (votes or multiple critic
--      sources), independently re-asserting the eligibility gate
--   3. no empty collections, no redirect pointing at a missing slug
-- Applied live 2026-08-19 (as collections_canary + collections_canary_v2,
-- final text below), chained into cron job 1:
--   select public.rebuild_collections(); select public.collections_canary();
-- Verified green against the live 600 collections at apply time.
create or replace function public.collections_canary()
returns void
language plpgsql
set search_path = public
as $$
declare
  bad_order int;
  weak_top int;
  empties int;
  dead_redirects int;
begin
  select count(distinct slug) into bad_order from (
    select ci.slug, m.rating_balasaur,
           lag(m.rating_balasaur) over (partition by ci.slug order by ci.rank) as prev
    from collection_items ci join media m on m.media_id = ci.media_id
  ) x where prev is not null and rating_balasaur > prev;

  select count(*) into weak_top
  from collection_items ci
  join media m on m.media_id = ci.media_id
  where ci.rank = 1
    and not (coalesce(m.vote_count, 0) >= 25
             or (m.rating_imdb is not null
                 and (m.rating_rotten_tomatoes is not null
                      or m.rating_metacritic is not null
                      or coalesce(m.popularity, 0) >= 20)));

  select count(*) into empties
  from collections c
  where c.item_count < 1
     or not exists (select 1 from collection_items ci where ci.slug = c.slug);

  select count(*) into dead_redirects
  from collection_redirects r
  where not exists (select 1 from collections c where c.slug = r.to_slug);

  if bad_order > 0 or weak_top > 0 or empties > 0 or dead_redirects > 0 then
    raise exception 'collections canary: % lists out of score order, % weak top items, % empty lists, % dead redirects',
      bad_order, weak_top, empties, dead_redirects;
  end if;
end
$$;

revoke execute on function public.collections_canary() from public, anon, authenticated;

select cron.alter_job(
  job_id := 1,
  command := 'select public.rebuild_collections(); select public.collections_canary();'
);
