-- A fixed panel of 100 URLs, inspected on every run, ahead of the rotating
-- sample. NOT YET APPLIED to the live project: apply it in the SQL editor,
-- then this file is the record.
--
-- Why. Since 2026-09-08 every run inspected about 200 URLs, 174 of them a
-- window that slides through the catalog by day number. "Share of inspected
-- pages that are indexed" therefore moved whenever the window moved, which
-- read as Google changing its mind about the site when it was only a
-- different set of pages. The 2026-08-22 version of this check said it
-- plainly: rotating URLs make every week incomparable. The panel restores a
-- comparable number; the rotating part shrinks from 174 to 100 so the run
-- stays at about 200 inspections, half of the gsc-sync daily budget of 400
-- (INSPECT_DAILY_BUDGET), which leaves room for hand inspections the same
-- day. Google's own quota is 2,000 a day.
--
-- The edge function does not change and needs no redeploy: it inspects
-- whatever list it is sent. The list is chosen here, in
-- index_status_sample(), and the panel now leads it, so a partial run spends
-- what budget there is on the panel first.
--
-- HOW TO READ THE TWO NUMBERS THAT MATTER
--
--   1. select * from index_panel_latest;
--      panel_indexed_pct is the share of the 100 panel URLs Google reports as
--      indexed (verdict PASS, "URL is on Google"). The same 100 URLs every
--      run, so a move is Google's doing or ours, never the sample's. Read it
--      next to panel_checked: below 100 means some URLs have never been
--      inspected yet and the share is over fewer pages. family_indexed_pct
--      splits it by page type. The title group was seeded mostly from titles
--      already indexed, so for titles watch for a fall; the /best and people
--      groups start mostly unindexed, so watch those for a rise. One run is
--      noise at this size (one URL is one point); trust a move that holds for
--      two runs.
--
--   2. select * from gsc_top20_weekly order by week_start desc;
--      impressions_top20 is how often a page of ours appeared in the first two
--      pages of Google results that week; impressions_top10 is the first page.
--      Pages that rank 50th earn impressions nobody sees, so total impressions
--      can rise while nothing improves; these two only rise when real
--      rankings do. Clicks follow top-10 impressions. Ignore the newest week
--      until days reads 7: Search Console lags about three days. Built from
--      the query-level table, which Google privacy-filters, so these sum lower
--      than the Search Console UI. Compare weeks with each other, not with the
--      UI. Baseline, read 2026-10-15: the week of Sep 14 had 663 impressions
--      and 0 in the top 20; the best full week since August had 8 in the top
--      20 and 2 in the top 10 (Sep 21). Nearly everything we show up for, we
--      show up for past page two.

create table if not exists public.index_panel (
  url text primary key,
  family text not null check (family in ('page', 'movie', 'tv', 'person', 'collection')),
  added_on date not null default current_date,
  note text
);

alter table public.index_panel enable row level security;
revoke all on table public.index_panel from anon, authenticated;
grant all on table public.index_panel to service_role;

-- Seeded from read-only queries against production on 2026-10-15. URLs are
-- literal, in the exact form the sitemaps emit (title slugs built by
-- src/lib/slug.ts, checked for all 302 previously indexed title URLs).
--
-- Titles, 38. Of the 40 most-rated titles in the sitemap, only Inception had
-- ever been inspected, so the rotating window was not reaching the pages
-- that matter most; 12 of them are here. 26 come from the 302 title URLs
-- index_status has ever recorded as "Submitted and indexed" (all 302 is seven
-- times this budget, and a title group that is entirely indexed could only
-- ever fall): 23 spread across sitemap ranks 425 to 1,500, movie and TV, plus
-- Sinners, Andor and El cor de la ciutat, tracked since August.
--
-- Baseline before the first panel run, from earlier inspections: 68 of the
-- 100 had been inspected at least once, and 45 of those 68 (66.2%) were
-- indexed. By group: titles 26 of 27, people 3 of 4, /best 14 of 23, site
-- pages 2 of 14. The 32 never inspected are mostly the famous titles and
-- people, so expect the first full run to move the share; compare from the
-- second run on.
-- People, 20: household names, plus the two tracked since August and two
-- already indexed. /best lists, 25: the five tracked since August, the four
-- that earn impressions, head terms Google has not indexed, and head terms it
-- has. Site pages, 17: the home page, the hub pages, and every arcade game,
-- which were already inspected on every run.
--
-- Editing the panel later: insert or delete rows. Every change breaks the
-- comparison for one run, so do it rarely and note it.
insert into public.index_panel (url, family, added_on, note) values
  -- site pages
  ('https://balasaur.com/', 'page', '2026-10-15', 'home page'),
  ('https://balasaur.com/collections', 'page', '2026-10-15', 'lists hub'),
  ('https://balasaur.com/calendar', 'page', '2026-10-15', 'hub page'),
  ('https://balasaur.com/methodology', 'page', '2026-10-15', 'explains the score'),
  ('https://balasaur.com/about', 'page', '2026-10-15', 'hub page'),
  ('https://balasaur.com/play', 'page', '2026-10-15', 'arcade hub'),
  ('https://balasaur.com/play/balasaurdle', 'page', '2026-10-15', 'arcade game'),
  ('https://balasaur.com/play/poster-reveal', 'page', '2026-10-15', 'arcade game'),
  ('https://balasaur.com/play/quote-match', 'page', '2026-10-15', 'arcade game'),
  ('https://balasaur.com/play/taglines', 'page', '2026-10-15', 'arcade game'),
  ('https://balasaur.com/play/casting-call', 'page', '2026-10-15', 'arcade game'),
  ('https://balasaur.com/play/link-up', 'page', '2026-10-15', 'arcade game'),
  ('https://balasaur.com/play/timeline', 'page', '2026-10-15', 'arcade game'),
  ('https://balasaur.com/play/screening', 'page', '2026-10-15', 'arcade game'),
  ('https://balasaur.com/play/emoji', 'page', '2026-10-15', 'arcade game'),
  ('https://balasaur.com/play/speed-sort', 'page', '2026-10-15', 'arcade game'),
  ('https://balasaur.com/play/sequel-or-fake', 'page', '2026-10-15', 'arcade game'),
  -- titles: most-rated in the sitemap
  ('https://balasaur.com/movie/interstellar-157336', 'movie', '2026-10-15', 'most-rated, never inspected'),
  ('https://balasaur.com/movie/inception-27205', 'movie', '2026-10-15', 'most-rated, tracked since Aug 22'),
  ('https://balasaur.com/movie/the-dark-knight-155', 'movie', '2026-10-15', 'most-rated, never inspected'),
  ('https://balasaur.com/movie/pulp-fiction-680', 'movie', '2026-10-15', 'most-rated, never inspected'),
  ('https://balasaur.com/movie/the-shawshank-redemption-278', 'movie', '2026-10-15', 'most-rated, never inspected'),
  ('https://balasaur.com/movie/the-godfather-238', 'movie', '2026-10-15', 'most-rated, never inspected'),
  ('https://balasaur.com/movie/avengers-endgame-299534', 'movie', '2026-10-15', 'most-rated, never inspected'),
  ('https://balasaur.com/movie/titanic-597', 'movie', '2026-10-15', 'most-rated, never inspected'),
  ('https://balasaur.com/tv/breaking-bad-1396', 'tv', '2026-10-15', 'most-rated, never inspected'),
  ('https://balasaur.com/tv/game-of-thrones-1399', 'tv', '2026-10-15', 'most-rated, never inspected'),
  ('https://balasaur.com/tv/stranger-things-66732', 'tv', '2026-10-15', 'most-rated, never inspected'),
  ('https://balasaur.com/tv/wednesday-119051', 'tv', '2026-10-15', 'most-rated, never inspected'),
  -- titles: indexed before
  ('https://balasaur.com/movie/sinners-1233413', 'movie', '2026-10-15', 'indexed before, tracked since Aug 22'),
  ('https://balasaur.com/tv/andor-83867', 'tv', '2026-10-15', 'indexed before, tracked since Aug 22'),
  ('https://balasaur.com/tv/el-cor-de-la-ciutat-14743', 'tv', '2026-10-15', 'indexed before, control since Aug 22'),
  ('https://balasaur.com/tv/the-vampire-diaries-18165', 'tv', '2026-10-15', 'indexed before'),
  ('https://balasaur.com/tv/dark-70523', 'tv', '2026-10-15', 'indexed before'),
  ('https://balasaur.com/tv/the-last-of-us-100088', 'tv', '2026-10-15', 'indexed before'),
  ('https://balasaur.com/tv/cobra-kai-77169', 'tv', '2026-10-15', 'indexed before'),
  ('https://balasaur.com/tv/the-witcher-71912', 'tv', '2026-10-15', 'indexed before'),
  ('https://balasaur.com/tv/black-mirror-42009', 'tv', '2026-10-15', 'indexed before'),
  ('https://balasaur.com/tv/naruto-46260', 'tv', '2026-10-15', 'indexed before'),
  ('https://balasaur.com/tv/how-i-met-your-mother-1100', 'tv', '2026-10-15', 'indexed before'),
  ('https://balasaur.com/tv/lost-4607', 'tv', '2026-10-15', 'indexed before'),
  ('https://balasaur.com/tv/band-of-brothers-4613', 'tv', '2026-10-15', 'indexed before'),
  ('https://balasaur.com/tv/true-detective-46648', 'tv', '2026-10-15', 'indexed before'),
  ('https://balasaur.com/movie/mean-girls-10625', 'movie', '2026-10-15', 'indexed before'),
  ('https://balasaur.com/movie/princess-mononoke-128', 'movie', '2026-10-15', 'indexed before'),
  ('https://balasaur.com/movie/everything-everywhere-all-at-once-545611', 'movie', '2026-10-15', 'indexed before'),
  ('https://balasaur.com/movie/project-hail-mary-687163', 'movie', '2026-10-15', 'indexed before'),
  ('https://balasaur.com/movie/there-will-be-blood-7345', 'movie', '2026-10-15', 'indexed before'),
  ('https://balasaur.com/movie/the-irishman-398978', 'movie', '2026-10-15', 'indexed before'),
  ('https://balasaur.com/movie/the-substance-933260', 'movie', '2026-10-15', 'indexed before'),
  ('https://balasaur.com/movie/casablanca-289', 'movie', '2026-10-15', 'indexed before'),
  ('https://balasaur.com/movie/poor-things-792307', 'movie', '2026-10-15', 'indexed before'),
  ('https://balasaur.com/movie/seven-samurai-346', 'movie', '2026-10-15', 'indexed before'),
  ('https://balasaur.com/movie/one-battle-after-another-1054867', 'movie', '2026-10-15', 'indexed before'),
  ('https://balasaur.com/movie/weapons-1078605', 'movie', '2026-10-15', 'indexed before'),
  -- people
  ('https://balasaur.com/person/525', 'person', '2026-10-15', 'Christopher Nolan'),
  ('https://balasaur.com/person/138', 'person', '2026-10-15', 'Quentin Tarantino'),
  ('https://balasaur.com/person/488', 'person', '2026-10-15', 'Steven Spielberg'),
  ('https://balasaur.com/person/1032', 'person', '2026-10-15', 'Martin Scorsese'),
  ('https://balasaur.com/person/6193', 'person', '2026-10-15', 'Leonardo DiCaprio'),
  ('https://balasaur.com/person/287', 'person', '2026-10-15', 'Brad Pitt'),
  ('https://balasaur.com/person/1245', 'person', '2026-10-15', 'Scarlett Johansson'),
  ('https://balasaur.com/person/31', 'person', '2026-10-15', 'Tom Hanks'),
  ('https://balasaur.com/person/2231', 'person', '2026-10-15', 'Samuel L. Jackson'),
  ('https://balasaur.com/person/380', 'person', '2026-10-15', 'Robert De Niro'),
  ('https://balasaur.com/person/192', 'person', '2026-10-15', 'Morgan Freeman'),
  ('https://balasaur.com/person/6384', 'person', '2026-10-15', 'Keanu Reeves'),
  ('https://balasaur.com/person/2227', 'person', '2026-10-15', 'Nicole Kidman'),
  ('https://balasaur.com/person/974169', 'person', '2026-10-15', 'Jenna Ortega'),
  ('https://balasaur.com/person/17419', 'person', '2026-10-15', 'Bryan Cranston'),
  ('https://balasaur.com/person/119143', 'person', '2026-10-15', 'Kana Hanazawa, most credits in the people sitemap'),
  ('https://balasaur.com/person/18897', 'person', '2026-10-15', 'Jackie Chan, tracked since Aug 22'),
  ('https://balasaur.com/person/123813', 'person', '2026-10-15', 'Ian Anthony Dale, indexed before, tracked since Aug 22'),
  ('https://balasaur.com/person/1315036', 'person', '2026-10-15', 'Daisy Ridley, indexed before'),
  ('https://balasaur.com/person/15344', 'person', '2026-10-15', 'J.J. Abrams, indexed before'),
  -- /best lists
  ('https://balasaur.com/best/best-action-movies', 'collection', '2026-10-15', 'tracked since Aug 22'),
  ('https://balasaur.com/best/best-action-movies-on-netflix', 'collection', '2026-10-15', 'tracked since Aug 22'),
  ('https://balasaur.com/best/anime-worth-starting', 'collection', '2026-10-15', 'tracked since Aug 22'),
  ('https://balasaur.com/best/best-crime-shows-on-hulu', 'collection', '2026-10-15', 'tracked since Aug 22'),
  ('https://balasaur.com/best/best-christopher-nolan-movies', 'collection', '2026-10-15', 'tracked since Aug 22'),
  ('https://balasaur.com/best/best-movies-on-disney-plus', 'collection', '2026-10-15', 'earning impressions'),
  ('https://balasaur.com/best/best-crime-movies-on-tubi', 'collection', '2026-10-15', 'earning impressions'),
  ('https://balasaur.com/best/best-romance-movies-on-tubi', 'collection', '2026-10-15', 'earning impressions'),
  ('https://balasaur.com/best/best-mystery-movies-on-tubi', 'collection', '2026-10-15', 'earning impressions'),
  ('https://balasaur.com/best/best-movies-on-netflix', 'collection', '2026-10-15', 'head term, not indexed'),
  ('https://balasaur.com/best/best-shows-on-netflix', 'collection', '2026-10-15', 'head term, not indexed'),
  ('https://balasaur.com/best/best-movies-on-max', 'collection', '2026-10-15', 'head term, not indexed'),
  ('https://balasaur.com/best/best-shows-on-prime', 'collection', '2026-10-15', 'head term, not indexed'),
  ('https://balasaur.com/best/best-horror-movies', 'collection', '2026-10-15', 'head term, not indexed'),
  ('https://balasaur.com/best/best-comedy-movies', 'collection', '2026-10-15', 'head term, not indexed'),
  ('https://balasaur.com/best/best-thriller-movies', 'collection', '2026-10-15', 'head term, not indexed'),
  ('https://balasaur.com/best/best-science-fiction-movies', 'collection', '2026-10-15', 'head term, never inspected'),
  ('https://balasaur.com/best/best-movies-on-hulu', 'collection', '2026-10-15', 'head term, indexed before'),
  ('https://balasaur.com/best/best-shows-on-hulu', 'collection', '2026-10-15', 'head term, indexed before'),
  ('https://balasaur.com/best/best-animation-movies', 'collection', '2026-10-15', 'head term, indexed before'),
  ('https://balasaur.com/best/best-crime-shows', 'collection', '2026-10-15', 'head term, indexed before'),
  ('https://balasaur.com/best/best-movies-of-2024', 'collection', '2026-10-15', 'year list, indexed before'),
  ('https://balasaur.com/best/best-movies-of-the-2020s', 'collection', '2026-10-15', 'decade list, indexed before'),
  ('https://balasaur.com/best/hidden-gems', 'collection', '2026-10-15', 'discovery list, indexed before'),
  ('https://balasaur.com/best/completed-tv-shows-worth-binging', 'collection', '2026-10-15', 'discovery list, indexed before')
on conflict (url) do nothing;

-- The sample: panel first, then the rotating windows, each URL once. The
-- windows are the 2026-09-08 ones made smaller (lists 60 to 35, titles 80 to
-- 45, people 34 to 20) and the old 26 fixed URLs are gone from here: the ones
-- worth keeping are panel rows now. Prime Rewind: Inside the Boys, a fixed
-- URL since August, was dropped: it is no longer an indexable title.
create or replace function public.index_status_sample()
returns text[]
language sql stable
set search_path = public
as $$
with d as (select (extract(epoch from now())::bigint / 86400)::int as day),
panel as (
  select url as u, 0 as grp, row_number() over (order by family, url) as ord
  from index_panel
),
c_all as (
  select slug, row_number() over (order by slug) - 1 as rn, count(*) over () as cnt
  from collections
),
cols as (
  select 'https://balasaur.com/best/' || slug as u
  from c_all, d
  where ((rn - (d.day * 17) % cnt + cnt) % cnt) < 35
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
  where ((rn - (d.day * 29) % 3000 + 3000) % 3000) < 45
),
p_all as (
  select person_id, row_number() over (order by titles desc, person_id) - 1 as rn, count(*) over () as cnt
  from person_index where titles >= 8
),
people as (
  select 'https://balasaur.com/person/' || person_id as u
  from p_all, d
  where ((rn - (d.day * 23) % cnt + cnt) % cnt) < 20
),
rotating as (
  select u, 1 as grp, row_number() over () as ord
  from (
    select u from cols
    union all select u from titles
    union all select u from people
  ) r
),
each_once as (
  select distinct on (u) u, grp, ord
  from (select u, grp, ord from panel union all select u, grp, ord from rotating) a
  order by u, grp, ord
)
select array_agg(u order by grp, ord) from each_once;
$$;

-- Latest inspection of every panel URL, with the panel's indexed share on
-- every row so one select answers "how are we doing".
create or replace view public.index_panel_latest
with (security_invoker = true) as
with latest as (
  select distinct on (s.url)
         s.url, s.checked_at, s.verdict, s.coverage_state, s.last_crawl, s.google_canonical
  from public.index_status s
  join public.index_panel p on p.url = s.url
  order by s.url, s.checked_at desc
),
panel_rows as (
  select p.url, p.family, p.note,
         l.checked_at, l.coverage_state, l.verdict, l.last_crawl, l.google_canonical,
         (l.verdict = 'PASS') as indexed
  from public.index_panel p
  left join latest l on l.url = p.url
)
select url, family, note, checked_at, coverage_state, verdict, last_crawl, google_canonical, indexed,
       count(*) over () as panel_size,
       count(checked_at) over () as panel_checked,
       round(100.0 * count(*) filter (where indexed) over ()
             / nullif(count(checked_at) over (), 0), 1) as panel_indexed_pct,
       round(100.0 * count(*) filter (where indexed) over (partition by family)
             / nullif(count(checked_at) over (partition by family), 0), 1) as family_indexed_pct
from panel_rows
order by family, indexed nulls first, url;

-- Weekly search performance, cut at the positions people actually see.
-- position is Google's average rank for that page and query that day; rows
-- with no position (0) are left out of both cuts rather than counted as first.
create or replace view public.gsc_top20_weekly
with (security_invoker = true) as
select date_trunc('week', date)::date as week_start,
       count(distinct date) as days,
       coalesce(sum(clicks), 0) as clicks,
       coalesce(sum(impressions), 0) as impressions,
       coalesce(sum(impressions) filter (where position > 0 and position <= 20), 0) as impressions_top20,
       coalesce(sum(impressions) filter (where position > 0 and position <= 10), 0) as impressions_top10
from public.gsc_performance
group by 1
order by 1 desc;

revoke all on table public.index_panel_latest from anon, authenticated;
revoke all on table public.gsc_top20_weekly from anon, authenticated;
grant select on table public.index_panel_latest to service_role;
grant select on table public.gsc_top20_weekly to service_role;

comment on table public.index_panel is
  'The 100 URLs inspected on every index-status run, before the rotating sample. Edit rarely: each change breaks the run-to-run comparison once.';
comment on view public.index_panel_latest is
  'Latest Google index state per panel URL. panel_indexed_pct is the share of inspected panel URLs Google reports as indexed; the same URLs every run, so a move is real. Trust a move that holds for two runs.';
comment on view public.gsc_top20_weekly is
  'Weekly clicks and impressions from pages ranking in the top 20 and top 10. Ignore the newest week until days = 7. Query-level data, so sums run below the Search Console UI; compare weeks with each other.';
