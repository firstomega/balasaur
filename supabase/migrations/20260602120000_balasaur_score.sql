-- Balasaur Score: one 0–100 number blended from the external critic/audience scores
-- (and, in future, Balasaur users' own ratings — weighted heaviest). Stored as a
-- GENERATED column so it computes for every existing row immediately (no backfill)
-- and stays correct on every write.
--
-- Weights, renormalized over whatever scores a title actually has:
--   user ratings 0.50 · IMDb 0.25 · Rotten Tomatoes 0.125 · Metacritic 0.125
-- rating_user_avg is null for now (no user ratings yet), so today the score is just
-- the external blend (which renormalizes to IMDb 0.5 / RT 0.25 / MC 0.25). When user
-- ratings start filling rating_user_avg (0–100), they immediately dominate — the
-- weighting is "priced in" and the score recomputes automatically.

alter table public.media
  add column if not exists rating_user_avg numeric;

alter table public.media
  add column if not exists rating_balasaur integer
  generated always as (
    case
      when (
        (case when rating_user_avg is not null then 0.5 else 0 end)
        + (case when rating_imdb is not null then 0.25 else 0 end)
        + (case when rating_rotten_tomatoes is not null then 0.125 else 0 end)
        + (case when rating_metacritic is not null then 0.125 else 0 end)
      ) > 0
      then round(
        (
          coalesce(rating_user_avg * 0.5, 0)
          + coalesce(rating_imdb * 10 * 0.25, 0)
          + coalesce(rating_rotten_tomatoes * 0.125, 0)
          + coalesce(rating_metacritic * 0.125, 0)
        )
        / (
          (case when rating_user_avg is not null then 0.5 else 0 end)
          + (case when rating_imdb is not null then 0.25 else 0 end)
          + (case when rating_rotten_tomatoes is not null then 0.125 else 0 end)
          + (case when rating_metacritic is not null then 0.125 else 0 end)
        )
      )::int
      else null
    end
  ) stored;

create index if not exists idx_media_rating_balasaur
  on public.media (rating_balasaur desc nulls last);
