-- One trust rule for every score and every ranked list.
--
-- NOT YET APPLIED. Written 2026-10-15 for the owner to apply to the live
-- project; this file is the change itself, not a record of one already made.
-- Safe to run twice: the three helper functions are CREATE OR REPLACE, and
-- each patch below skips a function that already carries the gate.
--
-- THE BUG. "Grand Theft Auto VI: An Extended Look", a 27-minute trailer with
-- only a TMDB rating, was #1 on Action Movies on Netflix. Talk shows sat on
-- comedy lists, Pixar shorts on Disney+ lists, and Hidden Gems was "under 12
-- TMDB popularity", which let Amadeus, Ben-Hur and Mary Poppins in.
--
-- THE RULE. Written once in src/lib/trust.ts and mirrored here verbatim;
-- src/lib/trust.test.ts reads this file and fails if the thresholds or the
-- two title patterns drift.
--
--   score shown    2+ of IMDb, RT, Metacritic, TMDB and 10+ TMDB votes
--                  (unknown count allowed), or 1 source with 500+ votes
--   rankable       score shown, 25+ votes, and not: a movie under 40 minutes,
--                  a trailer, teaser, first look or making-of, a holiday,
--                  anniversary or reunion special, a Talk, Reality or News show
--   hidden gem     rankable, score 75+, fewer than 500 votes
--
-- WHAT THIS CHANGES, previewed read-only against the live catalog on
-- 2026-10-15 (the commit message carries the per-list detail):
--   * rebuild_collections(): its single eligibility gate becomes
--     balasaur_rankable(), and Hidden Gems is redefined by votes.
--     13 lists no longer reach their minimum size and stop being generated
--     (6 genre-service, 6 TV year lists 1984 to 1991, Indian action shows).
--   * collections_canary(): asserts every listed title passes the gate,
--     replacing the old "is the #1 corroborated" check.
--   * night_recommend() and night_preview(): the quality-floor branch also
--     requires balasaur_rankable(). Titles a member asked for still bypass it.
--     The News arm is not applied here: reading TMDB genres means unpacking
--     raw_tmdb for every candidate on an interactive request.
--
-- The rating_balasaur generated column and the media table are untouched.

create or replace function public.balasaur_score_trusted(p_sources integer, p_votes bigint)
returns boolean
language sql
immutable
parallel safe
as $$
  select coalesce(
    (p_sources >= 2 and (p_votes is null or p_votes >= 10))
    or (p_sources = 1 and p_votes >= 500),
    false)
$$;

create or replace function public.balasaur_list_excluded(
  p_media_type text,
  p_title text,
  p_genres text[],
  p_film_minutes integer,
  p_tmdb_genres jsonb
)
returns boolean
language sql
immutable
parallel safe
as $$
  select coalesce(
    (p_media_type = 'movie' and p_film_minutes is not null and p_film_minutes between 1 and 39)
    or coalesce(p_title, '') ~* '(^|[^a-z0-9])(teaser|featurette|sneak peek|extended look|first look|behind the scenes|making[- ]of(?! an? )|(official|final|launch|announcement|reveal|story|gameplay|cinematic|extended|international|red band|super bowl|tv) trailer)([^a-z0-9]|$)|[-:(|] *trailer([^a-z0-9]|$)'
    or coalesce(p_title, '') ~* '(^|[^a-z0-9])((holiday|christmas|xmas|halloween|thanksgiving|easter|anniversary|reunion|live|tv|television) special|[0-9]+(st|nd|rd|th) anniversary)([^a-z0-9]|$)|: the reunion([^a-z0-9]|$)'
    or coalesce(p_genres, '{}'::text[]) && array['Talk', 'Reality TV']
    or (p_media_type = 'tv' and coalesce(p_tmdb_genres, '[]'::jsonb) @> '[{"name":"News"}]'),
    false)
$$;

create or replace function public.balasaur_rankable(
  p_media_type text,
  p_title text,
  p_genres text[],
  p_film_minutes integer,
  p_tmdb_genres jsonb,
  p_sources integer,
  p_votes bigint
)
returns boolean
language sql
immutable
parallel safe
as $$
  select public.balasaur_score_trusted(p_sources, p_votes)
     and coalesce(p_votes, 0) >= 25
     and not public.balasaur_list_excluded(p_media_type, p_title, p_genres, p_film_minutes, p_tmdb_genres)
$$;

-- rebuild_collections(): patched in place, the house pattern for this
-- function (see collections_tv_genre_dedupe). The live body has had targeted
-- edits since the last full copy in the repo, so it is read back from the
-- database, the two anchors are replaced, and the result is executed as the
-- CREATE OR REPLACE it already is. Each anchor must match exactly once.
do $mig$
declare
  d text;
  n int;
  gate_re constant text :=
    'and \(coalesce\(vote_count, 0\) >= 25\s+or \(rating_imdb is not null\s+and \(rating_rotten_tomatoes is not null\s+or rating_metacritic is not null\s+or coalesce\(popularity, 0\) >= 20\)\)\)';
begin
  select pg_get_functiondef(p.oid) into d
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'rebuild_collections';

  if position('balasaur_rankable' in d) > 0 then
    raise notice 'rebuild_collections already gated, skipping';
    return;
  end if;

  -- 1. The eligibility gate: corroboration becomes the shared rule.
  select count(*) into n from regexp_matches(d, gate_re, 'g');
  if n <> 1 then
    raise exception 'expected exactly 1 eligibility gate, found %', n;
  end if;
  d := regexp_replace(d, gate_re,
    'and public.balasaur_rankable(media_type, title, genres, film_length_minutes,' || E'\n' ||
    '             case when media_type = ''tv'' then raw_tmdb->''genres'' end,' || E'\n' ||
    '             num_nonnulls(rating_imdb, rating_rotten_tomatoes, rating_metacritic, rating_tmdb),' || E'\n' ||
    '             vote_count)');

  -- 2. Hidden Gems: a high score few people have rated, not low TMDB buzz.
  n := length(d);
  d := replace(d,
    'where e.rating_balasaur >= 75 and coalesce(e.popularity, 0) < 12',
    'where e.rating_balasaur >= 75 and coalesce(e.vote_count, 0) < 500');
  if length(d) = n then raise exception 'anchor 2 (hidden gems) not found'; end if;

  execute d;
end
$mig$;

-- night_recommend() and night_preview(): the quality-floor branch gains the
-- gate. Same read-back-and-patch approach, so drift in the rest of the body
-- is preserved.
do $mig$
declare
  d text;
  n int;
  anchor text;
  gate constant text :=
    ' and public.balasaur_rankable(md.media_type, md.title, md.genres, md.film_length_minutes, null, num_nonnulls(md.rating_imdb, md.rating_rotten_tomatoes, md.rating_metacritic, md.rating_tmdb), md.vote_count)';
begin
  select pg_get_functiondef(p.oid) into d
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'night_recommend';
  if position('balasaur_rankable' in d) = 0 then
    anchor := 'coalesce(md.vote_count, 0) >= v_floor.min_votes)';
    n := (length(d) - length(replace(d, anchor, ''))) / length(anchor);
    if n <> 1 then raise exception 'night_recommend: expected 1 floor anchor, found %', n; end if;
    d := replace(d, anchor, 'coalesce(md.vote_count, 0) >= v_floor.min_votes' || gate || ')');
    execute d;
  end if;

  select pg_get_functiondef(p.oid) into d
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'night_preview';
  if position('balasaur_rankable' in d) = 0 then
    anchor := 'coalesce(md.vote_count, 0) >= 200)';
    n := (length(d) - length(replace(d, anchor, ''))) / length(anchor);
    if n <> 1 then raise exception 'night_preview: expected 1 floor anchor, found %', n; end if;
    d := replace(d, anchor, 'coalesce(md.vote_count, 0) >= 200' || gate || ')');
    execute d;
  end if;
end
$mig$;

-- The canary re-asserts the gate independently after every nightly rebuild.
-- Check 2 used to ask only whether each list's #1 was corroborated; it now
-- asks whether any listed title fails the shared rule.
create or replace function public.collections_canary()
returns void
language plpgsql
set search_path = public
as $$
declare
  bad_order int;
  untrusted int;
  empties int;
  dead_redirects int;
begin
  select count(distinct slug) into bad_order from (
    select ci.slug, m.rating_balasaur,
           lag(m.rating_balasaur) over (partition by ci.slug order by ci.rank) as prev
    from collection_items ci join media m on m.media_id = ci.media_id
  ) x where prev is not null and rating_balasaur > prev;

  select count(*) into untrusted
  from collection_items ci
  join media m on m.media_id = ci.media_id
  where not public.balasaur_rankable(
    m.media_type, m.title, m.genres, m.film_length_minutes,
    case when m.media_type = 'tv' then m.raw_tmdb->'genres' end,
    num_nonnulls(m.rating_imdb, m.rating_rotten_tomatoes, m.rating_metacritic, m.rating_tmdb),
    m.vote_count);

  select count(*) into empties
  from collections c
  where c.item_count < 1
     or not exists (select 1 from collection_items ci where ci.slug = c.slug);

  select count(*) into dead_redirects
  from collection_redirects r
  where not exists (select 1 from collections c where c.slug = r.to_slug);

  if bad_order > 0 or untrusted > 0 or empties > 0 or dead_redirects > 0 then
    raise exception 'collections canary: % lists out of score order, % listed titles failing the trust gate, % empty lists, % dead redirects',
      bad_order, untrusted, empties, dead_redirects;
  end if;
end
$$;

revoke execute on function public.collections_canary() from public, anon, authenticated;

select public.rebuild_collections();
select public.collections_canary();
