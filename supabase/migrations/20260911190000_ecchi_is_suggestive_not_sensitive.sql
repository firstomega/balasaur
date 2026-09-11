-- Ecchi moves from the adult tier to the fan-service tier.
--
-- `sensitive` is supposed to flag a title for what it IS, never for what it is
-- ABOUT (see src/lib/contentSafety.ts). "ecchi" names a tone, so it was the
-- wrong kind of term to sit in PRODUCTION_TERMS, and it had flagged 304
-- licensed anime as hard-adult. Everything in that set was noindex and out of
-- browse: My Dress-Up Darling, Food Wars, Kill la Kill, No Game No Life, Fairy
-- Tail, Mushoku Tensei, The Seven Deadly Sins. None of them is pornography and
-- all of them are licensed on Crunchyroll or Netflix.
--
-- They stay `suggestive`, so the site still never recommends them: they are out
-- of the rails, the collections and the rate deck exactly as before. The change
-- is only that their pages are reachable and indexable again.
--
-- This mirrors a change already applied live (house rule: live first, then
-- mirrored here). The predicate matches hasTerm()'s whole-word test rather than
-- exact equality, so "japanese softcore" still counts as a production marker,
-- and a TMDB `adult: true` payload still flags on its own.
with kwtext as (
  select m.media_id,
    (m.raw_tmdb->>'adult') = 'true' as tmdb_adult,
    coalesce(string_agg(lower(k->>'name'), ' | '), '') as kws
  from media m
  left join lateral jsonb_array_elements(
    coalesce(m.raw_tmdb->'keywords'->'keywords',
             m.raw_tmdb->'keywords'->'results', '[]'::jsonb)) k on true
  where m.sensitive
  group by 1, 2
), target as (
  select media_id from kwtext
  where kws ~* '(^|[^a-z0-9])ecchi([^a-z0-9]|$)'
    and not tmdb_adult
    and kws !~* '(^|[^a-z0-9])(hentai|softcore|soft porn|sexploitation|pink film|pinku eiga|roman porno|av idol|adult film|adult movie|adult cinema|sex film|porn film|porn films|pornographic film|gay pornography|erotic movie|smut|gravure)([^a-z0-9]|$)'
)
update media m
set sensitive = false, suggestive = true
from target t
where m.media_id = t.media_id;
