-- Applied to the live project 2026-08-15. This file is the record, not the
-- source of truth (Lovable Cloud does not auto-apply repo migrations).
--
-- Occasion collections: the human-shaped half of the collection system. The
-- nine existing kinds are cross-products (service x genre, genre x decade),
-- which is a machine's shape. People search in occasions: "date night",
-- "something for the kids", "Halloween". A cross-product can never produce
-- those, because an occasion is an intent mapped to a predicate.
--
-- Recipes are DATA. Adding a collection is an INSERT; renaming one is an
-- UPDATE of `title`, never `slug`, which is the permanent URL. The generator
-- (see 20260815170000) loops these rows and applies `criteria` generically,
-- so nobody edits a 300-line function to add a shelf.
--
-- criteria keys, all optional, ANDed together:
--   media_type, genre_groups (each group needs one match), sub_genres_any,
--   themes_any, audience_any, exclude_genres, exclude_sub_genres,
--   exclude_audience, score_min, votes_min, runtime_min/max, year_min/max,
--   completion_any, seasons_min/max, award_nominee_within_years.
create table if not exists public.collection_recipes (
  slug        text primary key,
  title       text not null,
  section     text not null check (section in ('tonight','together','seasonal','itch')),
  -- Months (1-12) when this collection is promoted. Null is evergreen. A
  -- season controls PROMINENCE, never existence: pages persist year-round so
  -- they keep their search equity.
  season_months int[],
  criteria    jsonb not null,
  min_items   int not null default 20,
  active      boolean not null default true,
  sort_order  int not null default 0
);

alter table public.collection_recipes enable row level security;
revoke all on public.collection_recipes from anon, authenticated;
grant select on public.collection_recipes to service_role;

alter table public.collections add column if not exists season_months int[];

-- The seeded recipes live in the live table; see docs/OCCASIONS.md for the
-- reviewed list. Three were tuned after eyeballing the first rebuild:
--   game-day-movies  DELETED. The Sports theme ranked City Lights and Tokyo
--                    Story as game-day picks; a recipe that cannot be trusted
--                    is cut, which is the gate doing its job.
--   into-space       required Science Fiction + 1,000 votes + movie. It was
--                    led by "Among Us", a 173-vote animated series.
--   great-heists     restricted to movies. It was led by "The Shield".
--   valentines       year floor 1970, thriller/horror excluded. Vertigo is
--                    not a Valentine's pick.
--   date-night       year floor 1980. Without it the list was entirely
--                    pre-1960, because old classics hold the highest scores.
--   family-night     War and Horror excluded. Grave of the Fireflies carries
--                    a Family audience tag and is a film about children
--                    starving to death in wartime.
--   one-and-done     seasons_min 1. A show with no season data has array
--                    length 0 and was passing "one season or fewer".
