-- Applied to the live project first, mirrored here per the house rule. Recorded
-- as the same targeted edits that were applied, rather than a 22 KB copy of the
-- whole function, so the intent stays readable. The guards make it fail loudly
-- if the anchors ever move.
--
-- THE BUG. 19 pairs of collection pages, 38 pages in all, held the same titles
-- in the same order with the same description. TMDB gives television ONE genre
-- called "Action & Adventure" and ONE called "Sci-Fi & Fantasy". src/lib/
-- genres.ts splits each into two for filtering, which is correct there: someone
-- filtering by Fantasy should see Sci-Fi & Fantasy shows. The collection
-- generator then made a separate PAGE per half, and for television both halves
-- query the same TMDB genre, so they returned identical lists. Movies are
-- unaffected because TMDB genuinely separates Action from Adventure there.
--
-- This is the template-similar-at-volume pattern that gets a new domain
-- demoted, sitting on the site's one differentiated asset.
--
-- THE FIX. Stop generating the redundant half for television, and name the
-- survivor after what it actually contains. "The Best Science Fiction Shows of
-- All Time" listing Game of Thrones was the misleading half of the pair.
--
-- THE REDIRECTS. Retiring a slug must 301, never 404. rebuild_collections()
-- deletes and regenerates collection_redirects from _defs.legacy_slug on every
-- run, so redirects inserted by hand alongside it are destroyed by the next
-- rebuild. Learned the hard way: 19 URLs 404'd until legacy_slug was set here.
-- Declaring them in the recipe makes them regenerate on every rebuild forever.

do $mig$
declare d text; n int;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p
    join pg_namespace n2 on n2.oid = p.pronamespace
    where n2.nspname = 'public' and p.proname = 'rebuild_collections';

  -- 1. genre x service: do not generate the redundant TV half
  n := length(d);
  d := replace(d, '''Documentary'',''Adventure'',''Family'')',
                  '''Documentary'',''Adventure'',''Family'')' ||
       E'\n      and not (e.media_type = ''tv'' and gg.g in (''Adventure'',''Fantasy''))');
  if length(d) = n then raise exception 'anchor 1 (genre-service list) not found'; end if;

  -- 2. genre: same
  n := length(d);
  d := replace(d, '''Documentary'',''Adventure'',''Family'',''War'',''Western'')',
                  '''Documentary'',''Adventure'',''Family'',''War'',''Western'')' ||
       E'\n      and not (e.media_type = ''tv'' and gg.g in (''Adventure'',''Fantasy''))');
  if length(d) = n then raise exception 'anchor 2 (genre list) not found'; end if;

  -- 3 and 4. the surviving TV page names both halves
  n := length(d);
  d := replace(d, 'x.g || case when x.mt=''movie'' then '' Movies on '' else '' Shows on '' end',
    'case when x.mt=''tv'' and x.g=''Action'' then ''Action and Adventure'' when x.mt=''tv'' and x.g=''Science Fiction'' then ''Sci-Fi and Fantasy'' else x.g end || case when x.mt=''movie'' then '' Movies on '' else '' Shows on '' end');
  if length(d) = n then raise exception 'anchor 3 (service title) not found'; end if;

  n := length(d);
  d := replace(d, '''The Best '' || x.g || case when x.mt=''movie''',
    '''The Best '' || case when x.mt=''tv'' and x.g=''Action'' then ''Action and Adventure'' when x.mt=''tv'' and x.g=''Science Fiction'' then ''Sci-Fi and Fantasy'' else x.g end || case when x.mt=''movie''');
  if length(d) = n then raise exception 'anchor 4 (genre title) not found'; end if;

  -- 5 and 6. declare the retired slugs so every rebuild regenerates their 301s
  n := length(d);
  d := replace(d,
    'case when x.mt=''movie'' then ''best-'' || slugify(x.g) || ''-on-'' || slugify(x.s) else null end',
    'case when x.mt=''movie'' then ''best-'' || slugify(x.g) || ''-on-'' || slugify(x.s) when x.mt=''tv'' and x.g=''Action'' then ''best-adventure-shows-on-'' || slugify(x.s) when x.mt=''tv'' and x.g=''Science Fiction'' then ''best-fantasy-shows-on-'' || slugify(x.s) else null end');
  if length(d) = n then raise exception 'anchor 5 (service legacy_slug) not found'; end if;

  n := length(d);
  d := replace(d,
    'case when x.mt=''movie'' then ''best-'' || slugify(x.g) else null end',
    'case when x.mt=''movie'' then ''best-'' || slugify(x.g) when x.mt=''tv'' and x.g=''Action'' then ''best-adventure-shows'' when x.mt=''tv'' and x.g=''Science Fiction'' then ''best-fantasy-shows'' else null end');
  if length(d) = n then raise exception 'anchor 6 (genre legacy_slug) not found'; end if;

  execute d;
end
$mig$;

select public.rebuild_collections();

-- Verified after running: 659 collections (was 678), 0 duplicate pairs among the
-- 19 taxonomy pairs, 19 retired slugs present in collection_redirects, 0
-- redirects pointing at a slug that does not exist, 0 redirects shadowing a
-- live page, and the two survivors titled "The Best Action and Adventure Shows
-- of All Time" and "The Best Sci-Fi and Fantasy Shows of All Time".
--
-- STILL OPEN, and deliberately not touched here: best-horror-movies and
-- the-halloween-binge now hold an identical 60. That is a curation question
-- about what a seasonal shelf should contain, not a taxonomy bug, and it was
-- NOT an exact duplicate when this work started. Catalogue drift converged two
-- already heavily overlapping lists, which means it will flicker in and out of
-- exact duplication until the occasion recipe is given its own cut.
