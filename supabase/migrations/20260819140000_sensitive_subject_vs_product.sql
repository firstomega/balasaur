-- `sensitive` was flagging films for what they are ABOUT, not what they ARE,
-- and `sensitive` hides a title from the browse grid entirely. TMDB's keyword
-- "pornography" is subject matter, so the rule had hidden Taxi Driver
-- (Balasaur 86, 13,655 votes) from the whole site, along with Boogie Nights,
-- Euphoria, Shame, The People vs. Larry Flynt, Lost Highway, Pearl, X,
-- MaXXXine, 8MM and Primal Fear. Basic Instinct was hidden too, despite the
-- module's own comment claiming it kept erotic thrillers browsable.
--
-- Two mechanisms produced this:
--   1. Substring matching. "transmutation" contains "smut" (Arifureta);
--      "porn" sits inside "pornography", "pornographer", "porn industry".
--   2. A "two weak signals" rule that treated several facets of one subject
--      as independent evidence: "pornography" + "porn actor" + "porn industry"
--      is one fact about Boogie Nights, not three.
--
-- The corrected rule, mirroring deriveSensitive() in
-- src/lib/contentSafety.ts: flag only on PRODUCTION markers, whole-word, that
-- name the product or production tradition (hentai, softcore, pinku eiga,
-- av idol, roman porno, adult film, porn film, gravure, ecchi). Subject
-- markers never flag on their own, and there is no two-signal rule.
--
-- Applied live 2026-08-19. 116 titles released (1,018 -> 902 sensitive;
-- suggestive followed, 1,061 -> 941). Verified on both sides, which is the
-- check that was missing when this shipped: released reads Taxi Driver,
-- Euphoria, The Handmaiden, Boogie Nights, The Power of the Dog, Shame,
-- Basic Instinct; still flagged reads High School DxD, Interspecies
-- Reviewers, Emmanuelle, Nymphomaniac, 9 Songs. rebuild_collections() and
-- collections_canary() both green afterwards.
--
-- facets_derived_at is cleared on every touched row because `audience` is
-- derived from these flags, and the nightly backfill runs incrementally on
-- `facets_derived_at is null`; without this those rows would keep a stale
-- audience indefinitely.

with want as (
  select m.media_id,
    (coalesce((m.raw_tmdb->>'adult')::boolean,false) or exists (
       select 1 from jsonb_array_elements(
         coalesce(m.raw_tmdb->'keywords'->'keywords', m.raw_tmdb->'keywords'->'results','[]'::jsonb)) k
       where lower(k->>'name') ~ '\m(hentai|softcore|soft porn|sexploitation|pink film|pinku eiga|roman porno|av idol|adult film|adult movie|adult cinema|sex film|porn film|porn films|pornographic film|gay pornography|erotic movie|smut|ecchi|gravure)\M'
     )) as should_flag
  from public.media m
  where m.sensitive and m.raw_tmdb is not null
)
update public.media t
set sensitive = false, facets_derived_at = null, updated_at = now()
from want w where t.media_id = w.media_id and not w.should_flag;

-- `suggestive` is a superset of `sensitive`, so the released rows are
-- re-evaluated on the suggestive path: exact "harem" inside Animation only.
-- "reverse harem" and "male harem" are the josei and otome structure and are
-- deliberately not matched (they had excluded Ooku: The Inner Chambers).
with want as (
  select m.media_id,
    (m.sensitive or exists (
       select 1 from jsonb_array_elements(
         coalesce(m.raw_tmdb->'keywords'->'keywords', m.raw_tmdb->'keywords'->'results','[]'::jsonb)) k
       where lower(k->>'name') ~ '\m(fan service|fanservice|seduction comedy)\M'
          or ('Animation' = any(m.genres) and btrim(lower(k->>'name')) = 'harem')
     )) as should_flag
  from public.media m
  where m.suggestive and m.raw_tmdb is not null
)
update public.media t
set suggestive = false, facets_derived_at = null, updated_at = now()
from want w where t.media_id = w.media_id and not w.should_flag;

select public.rebuild_collections();
select public.collections_canary();
