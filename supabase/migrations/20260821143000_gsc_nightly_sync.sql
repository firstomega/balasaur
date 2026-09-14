-- Nightly Search Console pull, on the same scheduler that already runs the
-- collections rebuild (9:20) and the IndexNow ping (9:40). Runs on Supabase,
-- costs one edge-function invocation a night, and needs no session open. That
-- is the point: the state is waiting when a session starts, instead of costing
-- part of a session to rediscover.
--
-- 30 days rather than the full history: Google revises recent days for a while
-- after the fact, but anything older is settled, and the first backfill already
-- captured everything from the site's start (2026-06-01).
--
-- A log table because this runs unattended. Without it a silently failing job
-- looks exactly like a quiet week, which is the failure mode the nightly
-- catalog sync already taught us to design against.
--
-- Applied live 2026-08-21 and run once by hand to prove it end to end:
-- HTTP 200, 26 rows written for 2026-07-19 to 2026-08-18.
create table if not exists public.gsc_sync_log (
  id bigserial primary key,
  ran_at timestamptz not null default now(),
  ok boolean,
  detail text
);
alter table public.gsc_sync_log enable row level security;

create or replace function public.gsc_nightly()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req bigint;
  anon_key text;
  sync_secret text;
begin
  -- Both values come from Vault, never from this file. The anon key only gets
  -- the request past the function's JWT check and is public by design, but it
  -- does not belong in a public repo either. The shared secret is what the
  -- function actually checks.
  select decrypted_secret into anon_key
    from vault.decrypted_secrets where name = 'supabase_anon_key';
  select decrypted_secret into sync_secret
    from vault.decrypted_secrets where name = 'gsc_sync_secret';
  if anon_key is null or sync_secret is null then
    insert into public.gsc_sync_log (ok, detail)
      values (false, 'vault secrets supabase_anon_key and gsc_sync_secret must both be set');
    return;
  end if;

  select net.http_post(
    url := 'https://rqghkusdnfcydgfygvsr.supabase.co/functions/v1/gsc-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key,
      'x-gsc-sync-secret', sync_secret
    ),
    body := '{"action":"sync","days":30}'::jsonb,
    timeout_milliseconds := 120000
  ) into req;
  insert into public.gsc_sync_log (ok, detail) values (null, 'dispatched request ' || req);
end
$$;

revoke execute on function public.gsc_nightly() from public, anon, authenticated;

select cron.schedule('gsc-nightly', '0 10 * * *', 'select public.gsc_nightly()');
