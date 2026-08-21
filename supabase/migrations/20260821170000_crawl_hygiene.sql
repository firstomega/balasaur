-- Crawl hygiene, applied live 2026-08-21. Four unrelated-looking changes that
-- share one cause: the site was cheap for a person to use and expensive for a
-- crawler to read, and nothing recorded that fact.
--
-- 1. HONEST LASTMOD. The nightly rebuild deletes and reinserts all 635
--    collections with updated_at = now(), so every one claimed it changed
--    today, every day. Two costs: sitemap lastmod became noise Google learns
--    to ignore, and the "Updated" line printed on each collection page was
--    false for a list whose members had not moved in a week. A collection is
--    now dated by its content, the ranked member list hashed; a rebuild that
--    produces the same titles in the same order keeps the old date.
--    Verified: two consecutive rebuilds, 635 of 635 kept their date.
--
-- 2. FACETS CACHE. The homepage asks for facet counts with no filters, which
--    measured 1,687ms. It is the same answer for every visitor and changes
--    only when the nightly sync changes the catalog. Cached to a table
--    refreshed at 9:50; catalog_facets_cached() reads it for the unfiltered
--    case and computes live for every real filter combination.
--    Verified: 1,687ms -> 3ms.
--
-- 3. CRAWL HEALTH. Search Console reports "Server error: 1 page" days late and
--    never says which URL. A weekly probe now fetches a sample of every page
--    family as Googlebot and records status, time and size, so a regression is
--    a row a later session reads. First run: 39 URLs, zero failures, which is
--    also the honest answer on the reported 5xx: not reproducible today, and
--    now monitored if it returns.
--
-- 4. INDEXNOW LOGGING. The nightly Bing ping threw its answer away, and pg_net
--    prunes its response table, so a rejected key looked exactly like a
--    working night. Verified on the first logged run: 1,450 URLs, HTTP 200.

alter table public.collections add column if not exists content_hash text;

create table if not exists public.catalog_facets_cache (
  key text primary key,
  payload jsonb not null,
  refreshed_at timestamptz not null default now()
);
alter table public.catalog_facets_cache enable row level security;

create table if not exists public.crawl_health (
  id bigserial primary key,
  checked_at timestamptz not null default now(),
  url text not null,
  family text,
  status integer,
  ttfb_ms integer,
  bytes integer,
  error text
);
alter table public.crawl_health enable row level security;
create index if not exists idx_crawl_health_checked on public.crawl_health (checked_at desc);
create index if not exists idx_crawl_health_bad on public.crawl_health (checked_at desc)
  where status is null or status >= 400;

create table if not exists public.indexnow_log (
  id bigserial primary key,
  ran_at timestamptz not null default now(),
  submitted integer,
  request_id bigint,
  status_code integer,
  detail text
);
alter table public.indexnow_log enable row level security;

-- Function bodies as applied live: facets_params_are_default,
-- refresh_catalog_facets_cache, catalog_facets_cached, crawl_health_sample,
-- indexnow_nightly, and the two rebuild_collections patch points (the _prev
-- snapshot before the delete, and the content_hash update after item_count).
-- See the collections_honest_lastmod, catalog_facets_cache, crawl_health and
-- indexnow_and_crawl_health_logging migrations in the Supabase history for
-- the exact text; production is authoritative.

-- Schedule as applied:
--   rebuild-collections     20 9  * * *   rebuild + canary
--   person-index-refresh    30 9  * * *
--   indexnow-nightly        40 9  * * *   now via indexnow_nightly() wrapper
--   facets-cache-refresh    50 9  * * *   NEW
--   gsc-nightly              0 10 * * *
--   crawl-health-weekly     15 10 * * 1   NEW
