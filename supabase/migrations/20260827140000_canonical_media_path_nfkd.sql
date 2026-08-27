-- Applied to the live project first, mirrored here per the house rule.
--
-- canonical_media_path bailed to NULL on any title containing a non-ASCII
-- character, so 1,467 indexable titles were silently skipped by ping_indexnow,
-- the site's only automated crawl notification. WALL-E, Leon: The Professional,
-- Amelie and Naruto Shippuden among them.
--
-- The fix has to MATCH src/lib/slug.ts, not improve on it, because that module
-- decides the URL the site actually serves. unaccent() looks like the obvious
-- primitive and is WRONG here: it transliterates to ae/o/ss, so it would
-- announce /movie/aeon-flux while the site serves /movie/on-flux. JavaScript's
-- normalize("NFKD") plus strip-combining-marks leaves the ae ligature, o-slash,
-- eszett and oe-ligature undecomposed, and they fall through to a dash.
--
-- Postgres normalize(text, NFKD) is the same primitive and U+0300 to U+036F is
-- the same combining range slug.ts strips. Verified against the real
-- mediaSlug() on 20 titles spanning Latin accents, ligatures and strokes,
-- Cyrillic, Greek, CJK and Katakana: 20 of 20 identical, including the ugly
-- cases where both sides produce "on-flux" and "br-drene-dal".
--
-- After applying: 0 of 61,673 indexable rows return NULL, down from 1,467.

create or replace function public.canonical_media_path(p_media_id text, p_media_type text, p_title text)
returns text
language sql
immutable
as $function$
  select case
    when p_title is null then null
    else '/' || case when p_media_type = 'tv' then 'tv' else 'movie' end || '/' ||
      case when s = '' then id_part else s || '-' || id_part end
  end
  from (
    select
      regexp_replace(
        left(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                lower(regexp_replace(normalize(coalesce(p_title, ''), NFKD), '[̀-ͯ]', '', 'g')),
                '[^a-z0-9]+', '-', 'g'),
              '^-+', ''),
            '-+$', ''),
          80),
        '-+$', '') as s,
      regexp_replace(p_media_id, '^(movie|tv)-', '') as id_part
  ) t;
$function$;

-- Replacing the function alone would have announced almost nothing. The August
-- change-detection migration seeded indexnow_hash for every row, including the
-- 1,467 that had never actually been submitted, and ping_indexnow only picks up
-- a row whose stored hash differs from its current content hash. Measured
-- before clearing: 46 of the 1,467 were eligible. The other 1,421 would have
-- stayed silent until their title, score, streaming, release date, overview or
-- poster changed, which for a settled catalogue title may be never.
--
-- Clearing the hash makes them eligible once. 1,467 fits inside the 2,000
-- nightly cap, so they go out in a single run. Deliberately NOT done with
-- ping_indexnow(true): p_full makes all 61,673 rows eligible, the cap then
-- hands its slots to the highest-vote titles, and the accented tail waits again.

update public.media m
set indexnow_hash = null
from public.indexable_media im
where im.media_id = m.media_id
  and im.title !~ '^[[:ascii:]]*$'
  and m.indexnow_hash is not null;
