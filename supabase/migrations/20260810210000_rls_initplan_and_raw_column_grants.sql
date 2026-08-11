-- 1) RLS initplan fix (Supabase advisor 0003_auth_rls_initplan):
--    auth.uid() in a policy is re-evaluated per ROW; wrapping it in a scalar
--    subselect makes Postgres evaluate it once per statement. Same semantics,
--    measurably faster on multi-row reads/writes at scale.

alter policy "profiles_select_public_or_own" on public.profiles
  using (is_public or ((select auth.uid()) = id));
alter policy "profiles_insert_own" on public.profiles
  with check ((select auth.uid()) = id);
alter policy "profiles_update_own" on public.profiles
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
alter policy "profiles_delete_own" on public.profiles
  using ((select auth.uid()) = id);

alter policy "saved_filters_select_own" on public.saved_filters
  using ((select auth.uid()) = user_id);
alter policy "saved_filters_insert_own" on public.saved_filters
  with check ((select auth.uid()) = user_id);
alter policy "saved_filters_update_own" on public.saved_filters
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "saved_filters_delete_own" on public.saved_filters
  using ((select auth.uid()) = user_id);

alter policy "Users view own status" on public.user_media_status
  using ((select auth.uid()) = user_id);
alter policy "Users insert own status" on public.user_media_status
  with check ((select auth.uid()) = user_id);
alter policy "Users update own status" on public.user_media_status
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "Users delete own status" on public.user_media_status
  using ((select auth.uid()) = user_id);

-- 2) Stop serving raw_tmdb / raw_omdb to browser roles. These are full API
--    payloads (tens of KB per row), only ever read server-side via the service
--    role; the app's clients never query `media` directly (all catalog reads go
--    through server functions). Postgres column grants don't subtract from a
--    table-wide grant, so: revoke the table grant, re-grant every column except
--    the raw pair. NOTE: columns added to `media` later must be appended here
--    (or granted in their own migration) if browser roles ever need them.

revoke select on public.media from anon, authenticated;
grant select (
  media_id, media_type, title, year, overview, poster_url, popularity,
  release_date, rating_imdb, rating_rotten_tomatoes, rating_metacritic,
  rating_tmdb, rating_balasaur, rating_user_avg, genres, sub_genres, themes,
  audience, origins, streaming, streaming_regions, film_length_minutes,
  completion_status, length_label, people, seasons, award_winner, award_nominee,
  award_wins, award_nominations, awards_won, awards_nominated,
  facets_derived_at, fetched_at, updated_at
) on public.media to anon, authenticated;
