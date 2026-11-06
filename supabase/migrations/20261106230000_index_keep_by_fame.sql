-- NOT APPLIED: apply in Supabase before merging this PR
--
-- Offer Google the titles people know by name, not only the ones TMDB users
-- happen to rate. Additive: every title kept today stays kept.
--
-- WHY. The kept set (20261016010000_index_diet.sql) counted TMDB votes only.
-- TMDB's voters are few and recent, so it turned away 869 movies with 100,000+
-- IMDb votes (3 Idiots, The Great Escape, The Holdovers, A Separation, Das
-- Boot, Gandhi, Rashomon, City Lights, Ran, Paddington 2) and 373 shows with
-- 20,000+ (Scrubs, Call the Midwife, QI, I Love Lucy), while the site's own
-- lists link several of them up to 11 times each. Read 2026-11-06: 3,786
-- titles kept today, 5,028 under this rule, 0 removed.
--
-- HOW TO APPLY. Paste this whole file into the Supabase SQL editor and run it
-- once, outside the nightly sync. It runs as one transaction: the index and
-- the view appear together or not at all, and a failure part way changes
-- nothing. Building the index reads every stored OMDb payload once (about a
-- minute: reading the payloads of the 82,000 indexable titles took 24 to 30
-- seconds on 2026-11-06) and holds writes to public.media until it finishes;
-- reads, and so every page, carry on. Then:
--   select count(*) from public.index_kept_media;   -- expect 5,028 (+/- the
--                                                    -- night's sync)
-- Safe to run twice.
--
-- UNDO. Re-run section 1 of 20261016010000_index_diet.sql (the old view). The
-- function and the index can stay; nothing else reads them.

begin;

-- So a slow index build is not cut off by a per-statement time limit.
set local statement_timeout = '10min';

-- ---------------------------------------------------------------------------
-- 1. IMDb's vote count, read from the stored OMDb payload
-- ---------------------------------------------------------------------------
-- OMDb sends "2,877,173", or "N/A" when IMDb has no count. Anything that is
-- not digits and commas reads as unknown, which never qualifies. Mirrors
-- parseImdbVotes() in src/lib/indexKeep.ts.
create or replace function public.omdb_imdb_votes(raw jsonb)
returns bigint
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when raw->>'imdbVotes' ~ '^[0-9][0-9,]*$'
    then replace(raw->>'imdbVotes', ',', '')::bigint
  end
$$;

comment on function public.omdb_imdb_votes(jsonb) is
  'IMDb vote count from a stored OMDb payload ("2,877,173" -> 2877173; "N/A" -> null). Read by index_kept_media through media_imdb_votes_idx.';

-- The payload is stored out of line, so reading it for every row takes about
-- 30 seconds (measured 2026-11-06 against a 1.5 second scan today). The index
-- holds the number itself, so the view never opens a payload.
create index if not exists media_imdb_votes_idx
  on public.media (public.omdb_imdb_votes(raw_omdb));

-- Statistics for the new expression, so the planner knows few rows clear it.
analyze public.media;

-- ---------------------------------------------------------------------------
-- 2. The kept set: TMDB or IMDb shows the title is famous
-- ---------------------------------------------------------------------------
-- The first three conditions are today's, unchanged. The last two are the
-- IMDb lines, answered from media_imdb_votes_idx. indexable_media still
-- gates every row: sensitive titles and thin pages stay out whatever their
-- votes.
create or replace view public.index_kept_media
with (security_invoker = true) as
select im.*
from public.indexable_media im
where im.media_id in ('tv-14743')                           -- TITLE_KEEP_PINNED
   or (im.media_type = 'tv' and im.vote_count >= 300)       -- TITLE_KEEP_MIN_VOTES_TV
   or (im.media_type <> 'tv' and im.vote_count >= 3000)     -- TITLE_KEEP_MIN_VOTES_MOVIE
   or im.media_id in (select m.media_id from public.media m
       where m.media_type = 'tv' and public.omdb_imdb_votes(m.raw_omdb) >= 20000)      -- TITLE_KEEP_MIN_IMDB_VOTES_TV
   or im.media_id in (select m.media_id from public.media m
       where m.media_type <> 'tv' and public.omdb_imdb_votes(m.raw_omdb) >= 100000);  -- TITLE_KEEP_MIN_IMDB_VOTES_MOVIE

comment on view public.index_kept_media is
  'Titles offered to Google: indexable_media plus 3,000+ TMDB votes or 100,000+ IMDb votes (movies), 300+ TMDB or 20,000+ IMDb (shows), or pinned because Google already indexed them. Mirrors isKeptTitle() in src/lib/indexKeep.ts. Sitemap, IndexNow and the page head all read this rule.';

revoke all on public.index_kept_media from anon, authenticated;
grant select on public.index_kept_media to service_role;

commit;
