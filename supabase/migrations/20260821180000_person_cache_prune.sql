-- Record of a change already applied to the live project.
--
-- person_cache is a read-through cache with a 30 day TTL, but nothing ever
-- deleted an expired row. A crawler walking every cast link on every title
-- page filled it with 1,804,020 people (4,407 MB) in eleven days. Expired
-- rows are dead weight: the read path already ignores them.
--
-- The table was truncated at the same time, which also lets the leaner person
-- payload (credits no longer carry an unused synopsis) take effect.

create or replace function public.person_cache_prune()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.person_cache
  where fetched_at < now() - interval '30 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.person_cache_prune() from public, anon, authenticated;

select cron.schedule(
  'person-cache-prune',
  '5 10 * * *',
  $$select public.person_cache_prune()$$
);
