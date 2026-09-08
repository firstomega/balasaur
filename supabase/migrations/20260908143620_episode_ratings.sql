-- Applied to the live project first (version 20260908143620), mirrored here per
-- the house rule.
--
-- Per-episode TMDB ratings for the popular TV pool (vote_count >= 2000: 236
-- shows, 1,371 seasons, ~28,300 episodes today), plus the "we looked" stamp the
-- weekly fetch claims work with. Fetched a season at a time from
-- /tv/{id}/season/{n} in src/lib/media.server.ts (syncEpisodeRatings), driven by
-- .github/workflows/episode-ratings.yml through the apikey-gated sync hook.
--
-- votes > 0 is a constraint, not a convention: an episode nobody rated must be
-- absent from this table, because a stored zero paints as a bad episode.

create table if not exists public.episode_ratings (
  media_id text not null references public.media (media_id) on delete cascade,
  season int not null check (season > 0),
  episode int not null check (episode >= 0),
  rating numeric(3, 1) not null check (rating > 0 and rating <= 10),
  votes int not null check (votes > 0),
  air_date date,
  name text,
  updated_at timestamptz not null default now(),
  primary key (media_id, season, episode)
);

comment on table public.episode_ratings is 'TMDB per-episode rating and vote count for shows with vote_count >= 2000. Unrated episodes are absent, never stored as zero.';
comment on column public.episode_ratings.rating is 'TMDB vote_average for the episode, 0.1 to 10.';
comment on column public.episode_ratings.votes is 'TMDB vote_count for the episode. Always at least 1.';

-- Server-only, like the rest of the catalog: the browser reads this through a
-- server function, never through PostgREST.
alter table public.episode_ratings enable row level security;
revoke all on table public.episode_ratings from anon, authenticated;

-- The fetch claims shows "never looked at first, then stalest".
alter table public.media
  add column if not exists episodes_at timestamptz;

comment on column public.media.episodes_at is 'When this show''s seasons were last read from TMDB for per-episode ratings. Null means never.';

create index if not exists media_episode_sync_idx
  on public.media (episodes_at asc nulls first, popularity desc nulls last)
  where media_type = 'tv';
