-- Record of a change already applied to the live project.
--
-- gsc_performance stores Search Console rows at the date+page+QUERY grain.
-- Google withholds query-level rows for rare or personally-identifying
-- searches, so summing that table undercounts badly: it reported 5 impressions
-- on a day the page-level report showed 30, and 98 rows where the unfiltered
-- pull returns 321. Trending on it would have us reading the wrong number
-- every night.
--
-- This table stores the same window without the query dimension, which is not
-- filtered. gsc_performance stays for "what did people type"; this one is for
-- "how are we doing". Populated by the gsc-sync edge function, action
-- "totals".

create table if not exists public.gsc_page_daily (
  date date not null,
  page text not null,
  clicks integer not null default 0,
  impressions integer not null default 0,
  ctr numeric,
  position numeric,
  fetched_at timestamptz not null default now(),
  primary key (date, page)
);

alter table public.gsc_page_daily enable row level security;
grant select on public.gsc_page_daily to anon, authenticated;
grant all on public.gsc_page_daily to service_role;

create policy "gsc_page_daily is service-role only"
  on public.gsc_page_daily for select
  to service_role
  using (true);

create index if not exists idx_gsc_page_daily_date on public.gsc_page_daily (date desc);
