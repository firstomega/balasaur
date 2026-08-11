-- Balasaur Score v2: fold the TMDB audience score into the blend, at the
-- smallest weight. Why: ~every title has a TMDB rating, so with TMDB in the
-- blend nearly every card can show the one unified 0–100 badge instead of
-- falling back to a raw "★ 7.0" — the homepage stops mixing three score formats.
--
-- Weights, renormalized over whatever scores a title actually has:
--   user 0.50 · IMDb 0.25 · Rotten Tomatoes 0.125 · Metacritic 0.125 · TMDB 0.10
-- Mirrors src/lib/score.ts (computeBalasaurScore) — change both together.
--
-- A generated column's expression can't be altered in place, so drop + re-add.
-- The column-level SELECT grant from 20260810210000 dies with the drop, so it's
-- re-granted below (browser roles read rating_balasaur on shared lists).

alter table public.media drop column if exists rating_balasaur;

alter table public.media
  add column rating_balasaur integer
  generated always as (
    case
      when (
        (case when rating_user_avg is not null then 0.5 else 0 end)
        + (case when rating_imdb is not null then 0.25 else 0 end)
        + (case when rating_rotten_tomatoes is not null then 0.125 else 0 end)
        + (case when rating_metacritic is not null then 0.125 else 0 end)
        + (case when rating_tmdb is not null then 0.10 else 0 end)
      ) > 0
      then round(
        (
          coalesce(rating_user_avg * 0.5, 0)
          + coalesce(rating_imdb * 10 * 0.25, 0)
          + coalesce(rating_rotten_tomatoes * 0.125, 0)
          + coalesce(rating_metacritic * 0.125, 0)
          + coalesce(rating_tmdb * 10 * 0.10, 0)
        )
        / (
          (case when rating_user_avg is not null then 0.5 else 0 end)
          + (case when rating_imdb is not null then 0.25 else 0 end)
          + (case when rating_rotten_tomatoes is not null then 0.125 else 0 end)
          + (case when rating_metacritic is not null then 0.125 else 0 end)
          + (case when rating_tmdb is not null then 0.10 else 0 end)
        )
      )::int
      else null
    end
  ) stored;

create index if not exists idx_media_rating_balasaur
  on public.media (rating_balasaur desc nulls last);

grant select (rating_balasaur) on public.media to anon, authenticated;
