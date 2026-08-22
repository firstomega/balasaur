-- Record of a change already applied to the live project.
--
-- Impressions are a lagging indicator. Search Console finalizes on a 2 to 3 day
-- delay, and at 17 impressions a week the signal sits inside the noise for
-- weeks, which makes it useless for answering "did that change do anything".
-- Whether Google has CRAWLED a page is a leading indicator: it moves in days,
-- and URL Inspection reports it per URL through the API.
--
-- This stores a twice-weekly snapshot of a fixed sample, so a change can be
-- judged before the impression data catches up. The sample is fixed on purpose:
-- rotating URLs would make every week incomparable. It includes two title pages
-- that already earn impressions as a control group, so a site-wide rise in
-- crawling (Google being busier) can be told apart from our own doing.

create table if not exists public.index_status (
  checked_at timestamptz not null default now(),
  url text not null,
  family text not null,
  verdict text,
  coverage_state text,
  last_crawl timestamptz,
  robots_state text,
  google_canonical text,
  primary key (checked_at, url)
);

alter table public.index_status enable row level security;
grant select on public.index_status to anon, authenticated;
grant all on public.index_status to service_role;

create policy "index_status is service-role only"
  on public.index_status for select
  to service_role
  using (true);

create index if not exists idx_index_status_url on public.index_status (url, checked_at desc);

create or replace function public.index_status_sample()
returns text[]
language sql
stable
as $$
  select array[
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
  ];
$$;

create or replace function public.index_status_snapshot()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  req bigint;
begin
  select net.http_post(
    url := 'https://rqghkusdnfcydgfygvsr.supabase.co/functions/v1/gsc-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- The anon key is public by design (it ships in the browser bundle);
      -- it only gets the request past the function's JWT check.
      'Authorization', 'Bearer <anon key, see live function>'
    ),
    body := jsonb_build_object('action', 'inspect', 'store', true, 'urls', to_jsonb(public.index_status_sample())),
    timeout_milliseconds := 180000
  ) into req;
end
$function$;

revoke all on function public.index_status_snapshot() from public, anon, authenticated;

-- Twice a week. URL Inspection is rate limited and the sample is only 14 URLs,
-- so this is nowhere near any quota; twice weekly is simply the resolution at
-- which "has Google come back yet" is a meaningful question.
select cron.schedule(
  'index-status-snapshot',
  '30 10 * * 1,4',
  $$select public.index_status_snapshot()$$
);
