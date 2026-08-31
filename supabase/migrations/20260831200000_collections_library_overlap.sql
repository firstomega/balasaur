-- How much of each shelf the visitor has already seen.
--
-- The collections hub is served identically to everyone and cached for six
-- hours, so this cannot be part of the page. It also cannot be a plain client
-- query: collection_items is revoked from anon and authenticated on purpose.
-- So the browser posts its own library (which it already holds, signed in or
-- not) and gets back one count per shelf.
--
-- Only shelves with a match are returned, which keeps the payload proportional
-- to what the visitor has actually watched rather than to 673 shelves.
--
-- Applied to the live project 2026-08-31; this file is the record.
create or replace function public.collections_library_overlap(
  p_seen_ids text[] default '{}',
  p_want_ids text[] default '{}'
)
returns table (slug text, seen integer, want integer)
language sql
security definer
set search_path to 'public'
stable
as $$
  with seen as (select unnest(p_seen_ids[1:4000]) as media_id),
       want as (select unnest(p_want_ids[1:4000]) as media_id)
  select ci.slug,
         count(*) filter (where s.media_id is not null)::int as seen,
         count(*) filter (where w.media_id is not null)::int as want
  from collection_items ci
  left join seen s on s.media_id = ci.media_id
  left join want w on w.media_id = ci.media_id
  where s.media_id is not null or w.media_id is not null
  group by ci.slug;
$$;

revoke all on function public.collections_library_overlap(text[], text[]) from public;
grant execute on function public.collections_library_overlap(text[], text[])
  to anon, authenticated, service_role;
