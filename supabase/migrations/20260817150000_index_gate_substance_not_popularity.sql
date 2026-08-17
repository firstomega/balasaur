-- Applied to the live project 2026-08-17. This file is the record, not the
-- source of truth (Lovable Cloud does not auto-apply repo migrations).
--
-- The index gate measured the wrong thing and cost us ranking pages.
--
-- The gate shipped 2026-08-14 asked "did enough people rate this": 250+ TMDB
-- votes or a critic score. The Search Console performance export three days
-- later showed eleven of the thirteen best-performing pages carrying noindex,
-- roughly 270 of 476 impressions, several ranking on page one. Two faults:
--
--   1. `coalesce(vote_count, 0) >= 250` turns UNKNOWN into ZERO. 23,436
--      catalogued titles have no vote count fetched. The Patient, an Apple
--      TV+ drama with Steve Carell, failed because a number was missing.
--   2. Even a KNOWN low count does not predict search demand. Be My Guest
--      with Ina Garten (3 votes) ranked at 7.1; Testament (6 votes) at 5.9.
--
-- Popularity is therefore removed from the gate entirely. What remains is
-- whether the page can stand alone: at least two independent facts beyond
-- art, synopsis and score, counted from an audience rating, a critic rating,
-- streaming availability, three or more credited people, and a runtime or
-- season count.
--
-- Breadth and quality were never in tension. noindex is a PROHIBITION and now
-- bars only pages with nothing to say. The sitemap is a REQUEST and stays
-- curated at 2,500. Google is already choosing between them: it discovered
-- 10,337 URLs and indexed 287.
--
-- Result: 18,500 -> 57,469 indexable. 12 of the 14 pages with recorded
-- impressions are restored; the one still excluded (Bake Off: An Extra Slice)
-- has no rating, no critic score, no streaming and no cast, which is what a
-- thin page actually looks like.
--
-- Mirrors hasSubstance() in src/lib/indexability.ts. Change one, change both.
create or replace view public.indexable_media
with (security_invoker = true) as
select *
from public.media
where sensitive = false
  and poster_url is not null
  and overview is not null
  and overview <> ''
  and rating_balasaur is not null
  and (
    (case when rating_imdb is not null then 1 else 0 end)
  + (case when rating_rotten_tomatoes is not null or rating_metacritic is not null then 1 else 0 end)
  + (case when coalesce(array_length(streaming, 1), 0) > 0 then 1 else 0 end)
  + (case when jsonb_array_length(coalesce(people, '[]'::jsonb)) >= 3 then 1 else 0 end)
  + (case when film_length_minutes is not null
            or jsonb_array_length(coalesce(seasons, '[]'::jsonb)) > 0 then 1 else 0 end)
  ) >= 2;

comment on view public.indexable_media is
  'Titles with enough substance to stand alone in a search result. Mirrors hasSubstance() in src/lib/indexability.ts. Deliberately does NOT test popularity.';

revoke all on public.indexable_media from anon, authenticated;
grant select on public.indexable_media to service_role;

-- person_index reads indexable_media, so it was refreshed after this applied:
--   refresh materialized view public.person_index;
-- 7,983 -> 21,954 searchable people; 1,861 -> 4,975 in the person sitemap.
