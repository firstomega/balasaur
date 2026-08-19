-- The `suggestive` rule that shipped last night was too broad in three ways,
-- each found by reading the highest-profile titles it had flagged. Every one
-- of these titles was silently excluded from related rails, collections, the
-- rate deck, the calendar, and the daily puzzle pool.
--
--   1. Substring matching. "sharemarket fraud" contains "harem", so
--      The Wolf of Wall Street (26,288 votes) and Madoff: The Monster of
--      Wall Street were flagged as fan service.
--   2. "sexual fantasy" as a single-hit marker. It excluded American Beauty
--      (score 84), Barbarella, Cashback, Heavy, and Fading Gigolo. The term
--      stays a WEAK signal for `sensitive`, where two independent signals are
--      required, which is the correct treatment for adult-themed cinema.
--   3. "harem" on live action. TMDB tags Asian romance dramas "reverse harem"
--      for the plot structure, so the rule was excluding BOYS OVER FLOWERS,
--      Coffee Prince, You're Beautiful, and Cinderella and Four Knights.
--      That is the exact audience the K-Dramas shelf shipped for.
--
-- The corrected rule mirrors deriveSuggestive() in src/lib/contentSafety.ts:
-- whole-word markers only, no "sexual fantasy", and "harem" counts only
-- inside Animation, where it names the subgenre rather than a plot shape.
--
-- The corrected rule is strictly narrower than the one that shipped, so the
-- only possible change is clearing false positives; the update is scoped to
-- already-flagged rows for that reason. Applied live 2026-08-19: 36 titles
-- released (1,097 -> 1,061 flagged). Verified after the run: Wolf of Wall
-- Street, American Beauty, Boys Over Flowers and Coffee Prince all clear,
-- while genuine harem anime (The Quintessential Quintuplets Movie) stays
-- flagged. rebuild_collections() and collections_canary() both ran green.
with want as (
  select m.media_id,
    (m.sensitive or exists (
       select 1 from jsonb_array_elements(
         coalesce(m.raw_tmdb->'keywords'->'keywords', m.raw_tmdb->'keywords'->'results','[]'::jsonb)) k
       where lower(k->>'name') ~ '\m(ecchi|fan service|fanservice|gravure|seduction comedy)\M'
          or ('Animation' = any(m.genres) and lower(k->>'name') ~ '\mharem\M')
     )) as should_flag
  from public.media m
  where m.suggestive and m.raw_tmdb is not null
)
update public.media t set suggestive = false, updated_at = now()
from want w where t.media_id = w.media_id and not w.should_flag;

select public.rebuild_collections();
select public.collections_canary();
