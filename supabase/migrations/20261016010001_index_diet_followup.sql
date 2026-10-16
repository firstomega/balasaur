-- Follow-up to 20261016010000_index_diet.sql. Run it right after that file,
-- on its own: it parses TMDB credits for about 9,000 titles, which is too
-- slow to sit inside a migration. Until it runs, every person page says
-- noindex, the people sitemap is empty, and index_status_sample() errors.
-- Safe to run again at any time. The 09:36 cron job refreshes it every
-- night, and fills it the plain way if this file was never run.
--
-- Read 2026-10-16: the same ranking, run as a plain read-only SELECT,
-- finished inside the query tool's time limit. Its run time was not timed.

refresh materialized view public.person_index_kept;

-- What to expect, read 2026-10-15: 850 rows, rank 1 Robert Downey Jr.,
-- Christopher Nolan and Scarlett Johansson in the top 3.
select count(*) as kept_people, min(fame) as fame_at_cut from public.person_index_kept;

-- Every person on the index panel should be kept. Expect no rows.
select p.url, p.note
from public.index_panel p
where p.family = 'person'
  and not exists (select 1 from public.person_index_kept k
                  where p.url = 'https://balasaur.com/person/' || k.person_id);
