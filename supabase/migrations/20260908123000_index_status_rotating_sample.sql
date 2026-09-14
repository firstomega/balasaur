-- Index status sampling, widened from 14 fixed URLs to a rotating sample of
-- about 200 per run (Google allows 2,000 URL inspections a day). The window
-- into each family advances with the day number, so the twice-weekly runs
-- walk the whole catalog over time. Title URLs are built here exactly as
-- src/lib/slug.ts builds them, restricted to ASCII titles so the SQL slug
-- and the app slug cannot disagree (a mismatched slug would report as a
-- redirect instead of the page's real state). Applied live; this file is
-- the record.

create or replace function public.index_status_sample()
returns text[]
language sql stable
set search_path = public
as $$
with d as (select (extract(epoch from now())::bigint / 86400)::int as day),
sent as (
  select unnest(array[
    'https://balasaur.com/',
    'https://balasaur.com/collections',
    'https://balasaur.com/best/best-action-movies',
    'https://balasaur.com/best/best-action-movies-on-netflix',
    'https://balasaur.com/best/anime-worth-starting',
    'https://balasaur.com/best/best-crime-shows-on-hulu',
    'https://balasaur.com/best/best-christopher-nolan-movies',
    'https://balasaur.com/movie/inception-27205',
    'https://balasaur.com/movie/sinners-1233413',
    'https://balasaur.com/tv/andor-83867',
    'https://balasaur.com/tv/prime-rewind-inside-the-boys-106418',
    'https://balasaur.com/tv/el-cor-de-la-ciutat-14743',
    'https://balasaur.com/person/18897',
    'https://balasaur.com/person/123813'
  ]) as u
),
arc as (
  select 'https://balasaur.com/play' as u
  union all
  select 'https://balasaur.com/play/' || g from unnest(array[
    'balasaurdle','quote-match','taglines','casting-call','link-up','timeline',
    'screening','emoji','speed-sort','sequel-or-fake','poster-reveal']) g
),
c_all as (
  select slug, row_number() over (order by slug) - 1 as rn, count(*) over () as cnt
  from collections
),
cols as (
  select 'https://balasaur.com/best/' || slug as u
  from c_all, d
  where ((rn - (d.day * 17) % cnt + cnt) % cnt) < 60
),
t_all as (
  select media_id, media_type, title,
         row_number() over (order by vote_count desc nulls last, media_id) - 1 as rn
  from indexable_media
  where title ~ '^[ -~]+$'
  order by vote_count desc nulls last, media_id
  limit 3000
),
titles as (
  select 'https://balasaur.com/' || media_type || '/'
         || regexp_replace(left(regexp_replace(regexp_replace(lower(title), '[^a-z0-9]+', '-', 'g'), '^-+|-+$', '', 'g'), 80), '-+$', '')
         || '-' || split_part(media_id, '-', 2) as u
  from t_all, d
  where ((rn - (d.day * 29) % 3000 + 3000) % 3000) < 80
),
p_all as (
  select person_id, row_number() over (order by titles desc, person_id) - 1 as rn, count(*) over () as cnt
  from person_index where titles >= 8
),
people as (
  select 'https://balasaur.com/person/' || person_id as u
  from p_all, d
  where ((rn - (d.day * 23) % cnt + cnt) % cnt) < 34
)
select array_agg(u) from (
  select u from sent
  union all select u from arc
  union all select u from cols
  union all select u from titles
  union all select u from people
) x;
$$;

-- The edge function inspects at most 25 URLs per request, so the snapshot
-- sends the sample in chunks. pg_net posts are asynchronous; each chunk is
-- its own request. The bearer token and the shared secret both come from
-- Vault: the bearer only satisfies the function's JWT check, and the secret
-- in x-gsc-sync-secret is what the function checks before doing any work.
create or replace function public.index_status_snapshot()
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  urls text[] := public.index_status_sample();
  total int := coalesce(array_length(public.index_status_sample(), 1), 0);
  i int := 1;
  req bigint;
  anon_key text;
  sync_secret text;
begin
  select decrypted_secret into anon_key
    from vault.decrypted_secrets where name = 'supabase_anon_key';
  select decrypted_secret into sync_secret
    from vault.decrypted_secrets where name = 'gsc_sync_secret';
  if anon_key is null or sync_secret is null then
    raise exception 'vault secrets supabase_anon_key and gsc_sync_secret must both be set';
  end if;

  while i <= total loop
    select net.http_post(
      url := 'https://rqghkusdnfcydgfygvsr.supabase.co/functions/v1/gsc-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || anon_key,
        'x-gsc-sync-secret', sync_secret
      ),
      body := jsonb_build_object('action', 'inspect', 'store', true, 'urls', to_jsonb(urls[i:i+24])),
      timeout_milliseconds := 180000
    ) into req;
    i := i + 25;
  end loop;
end
$$;
