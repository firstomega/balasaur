-- Movie Night: a dealt card shows a score only where the title page shows one.
--
-- Applied live on 2026-10-16 with the Supabase MCP apply_migration tool; this
-- file is the record.
--
-- WHY. night_recommend() deals two kinds of title: ones that clear the quality
-- floor, already gated by balasaur_rankable since the trust gate, and ones a
-- member asked for, which were dealt with their raw rating_balasaur. Read on
-- 2026-10-16, the asked-for path could print a number the title's own page
-- hides: Verity (TMDB only, 88 votes), Animals (361 votes), Other Mommy, The
-- Fix, all new releases with one rating source so far. Dropping those titles
-- from the room was the first idea and was rejected on reading that list:
-- someone in the room asked for them.
--
-- WHAT. The title stays in the room. Only the number follows the badge rule.
-- The scored CTE gains score_trusted, and the dealt 'score' is rating_balasaur
-- when that is true, else null, which the client already renders as no badge.
-- night_preview() takes its front card from night_recommend(), so it inherits
-- this. Ranking is untouched: the match number a card prints is the order.
--
-- Applied as a read-back-and-patch of the live body, like the trust gate, so
-- drift in the rest of the function is preserved. Idempotent.
do $mig$
declare
  d text;
  n int;
  a1 constant text := 'md.rating_balasaur, md.genres, md.streaming, md.film_length_minutes,';
  r1 constant text := 'md.rating_balasaur, public.balasaur_score_trusted(num_nonnulls(md.rating_imdb, md.rating_rotten_tomatoes, md.rating_metacritic, md.rating_tmdb), md.vote_count) as score_trusted, md.genres, md.streaming, md.film_length_minutes,';
  a2 constant text := '''score'', r.rating_balasaur,';
  r2 constant text := '''score'', case when r.score_trusted then r.rating_balasaur end,';
begin
  select pg_get_functiondef(p.oid) into d
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'night_recommend';
  if d is null then raise exception 'night_recommend not found'; end if;
  if position('score_trusted' in d) > 0 then return; end if;
  n := (length(d) - length(replace(d, a1, ''))) / length(a1);
  if n <> 1 then raise exception 'night_recommend: expected 1 scored anchor, found %', n; end if;
  n := (length(d) - length(replace(d, a2, ''))) / length(a2);
  if n <> 1 then raise exception 'night_recommend: expected 1 score output anchor, found %', n; end if;
  d := replace(replace(d, a1, r1), a2, r2);
  execute d;
end
$mig$;
