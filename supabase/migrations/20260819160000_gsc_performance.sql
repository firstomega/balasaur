-- Our own copy of Search Console performance data.
--
-- Two reasons this table exists rather than reading Google on demand. Google
-- keeps 16 months and then drops the history, and the Search Console UI cannot
-- be read by an agent at all, which meant every question about what was
-- ranking needed the owner to export a file by hand. With rows here, any
-- session can ask "what is ranking, and did last month's change help" in SQL.
--
-- Written only by the gsc-sync edge function using the service role. RLS is on
-- with no policies, so no client role can read it: the queries people type are
-- not something to expose publicly.
--
-- Applied live 2026-08-19. First sync pulled 480 days and found the property
-- has data from 2026-06-01 (the site's real start), 494 impressions and 0
-- clicks across 118 pages.
--
-- Note on counts: rows carrying a `query` are privacy-filtered by Google, so
-- summing this table undercounts real impressions (144 at query level against
-- 494 actual). For true totals, ask the function for a single dimension
-- ({"action":"raw","dimensions":["page"]}), which is not filtered.
create table if not exists public.gsc_performance (
  date date not null,
  page text not null,
  query text not null,
  clicks integer not null default 0,
  impressions integer not null default 0,
  ctr numeric not null default 0,
  position numeric not null default 0,
  fetched_at timestamptz not null default now(),
  primary key (date, page, query)
);
alter table public.gsc_performance enable row level security;

create index if not exists idx_gsc_perf_date on public.gsc_performance (date desc);
create index if not exists idx_gsc_perf_page on public.gsc_performance (page);
create index if not exists idx_gsc_perf_impressions on public.gsc_performance (impressions desc);
