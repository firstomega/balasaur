-- Record of changes already applied to the live Supabase project (arcade_v1).
-- The repo file is the record; Lovable Cloud does not auto-apply it.
--
-- =============================================================================
-- BALASAUR ARCADE BACKBONE (v1)
-- =============================================================================
--
-- Eleven daily games, one economy. Comets are the arcade currency: earned by
-- the first credited run per (user, game, day), computed server-side from the
-- score and the game's registry caps, never trusted from the client.
--
-- Access model: browsers read arcade_games (caps and payout params, so guest
-- comet math matches the server) and their OWN runs/wallet/stats. Content
-- (arcade_items, arcade_daily) and aggregates (arcade_day_agg) are served only
-- through CDN-cached server fns using the service role. Every write goes
-- through a SECURITY DEFINER function that validates its inputs, because the
-- anon key can call anything with anything.
--
-- No weekly table and no cron: the weekly board is derived from arcade_runs
-- at read time. A run's week is derived from its day_key (the launch epoch is
-- 2026-08-18 = day 1, same epoch as src/lib/daily.ts); a new ISO week is
-- simply an empty range of day_keys. Guests never appear on boards: only
-- source='live' signed-in runs count, and guest-merge credits go to the
-- wallet, not to rank.
--
-- Accepted, stated plainly: daily payloads ship the answer (Balasaurdle
-- posture) and score is client-reported within caps, so a determined cheater
-- can post a perfect day. The caps bound the damage to one perfect day.

-- -----------------------------------------------------------------------------
-- Day and week helpers. arcade_day() is byte-identical in meaning to
-- dayNumber() in src/lib/daily.ts: days since 2026-08-18 UTC, day 1 inclusive.
-- -----------------------------------------------------------------------------
create or replace function public.arcade_day()
returns int
language sql stable
as $$ select (((now() at time zone 'utc')::date - date '2026-08-18') + 1)::int $$;

create or replace function public.arcade_week()
returns text
language sql stable
as $$ select to_char(now() at time zone 'utc', 'IYYY-"W"IW') $$;

-- Comet payout, the one formula both RPCs use:
--   0 when score < payout.floor_score, else
--   floor(score * daily_comet_cap / max_score) + payout.perfect_bonus at max.
create or replace function public.arcade_comets(p_score int, p_max int, p_cap int, p_payout jsonb)
returns int
language sql immutable
as $$
  select case
    when p_score is null or p_max is null or p_max <= 0 then 0
    when p_score < coalesce((p_payout->>'floor_score')::int, 0) then 0
    else floor(p_score::numeric * p_cap / p_max)::int
         + case when p_score >= p_max then coalesce((p_payout->>'perfect_bonus')::int, 0) else 0 end
  end
$$;

revoke all on function public.arcade_comets(int, int, int, jsonb) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 1. Game registry: per-game caps and payout params. Edited by SQL only.
-- -----------------------------------------------------------------------------
create table public.arcade_games (
  slug             text primary key,
  name             text not null,
  active           boolean not null default true,
  max_score        int not null check (max_score > 0),
  min_duration_ms  int not null default 3000,
  daily_comet_cap  int not null check (daily_comet_cap >= 0),
  -- 0 = the game derives content from media directly; >0 = items per day
  -- pinned from arcade_items into arcade_daily.
  items_per_day    smallint not null default 0,
  payout           jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

alter table public.arcade_games enable row level security;
revoke all on public.arcade_games from anon, authenticated;
grant select on public.arcade_games to anon, authenticated;
create policy arcade_games_read on public.arcade_games for select using (true);

-- -----------------------------------------------------------------------------
-- 2. Content items. payload is game-shaped jsonb and INCLUDES the answer
-- (Wordle posture). Served only through server fns; no client access.
-- -----------------------------------------------------------------------------
create table public.arcade_items (
  id          bigint generated always as identity primary key,
  game_slug   text not null references public.arcade_games(slug),
  media_id    text,
  payload     jsonb not null,
  difficulty  smallint not null default 2 check (difficulty between 1 and 3),
  pack        text not null default 'core',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index arcade_items_pool on public.arcade_items (game_slug, active, id);

alter table public.arcade_items enable row level security;
revoke all on public.arcade_items from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Daily pin: the deterministic pick, frozen forever. Pool membership shifts
-- as items are added or deactivated, so past days must never be recomputed.
-- -----------------------------------------------------------------------------
create table public.arcade_daily (
  game_slug text not null references public.arcade_games(slug),
  day_key   int not null,
  item_ids  bigint[] not null,
  primary key (game_slug, day_key)
);

alter table public.arcade_daily enable row level security;
revoke all on public.arcade_daily from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Runs: one credited row per player per game per day, the audit trail for
-- everything. Replays only raise score; they never re-credit comets.
-- -----------------------------------------------------------------------------
create table public.arcade_runs (
  user_id     uuid not null references auth.users(id) on delete cascade,
  game_slug   text not null references public.arcade_games(slug),
  day_key     int not null,
  score       int not null check (score >= 0),
  comets      int not null check (comets >= 0),
  duration_ms int not null,
  source      text not null default 'live' check (source in ('live', 'guest_merge')),
  created_at  timestamptz not null default now(),
  primary key (user_id, game_slug, day_key)
);
create index arcade_runs_day_board on public.arcade_runs (game_slug, day_key, score desc);
create index arcade_runs_week on public.arcade_runs (day_key) where source = 'live';

alter table public.arcade_runs enable row level security;
revoke all on public.arcade_runs from anon, authenticated;
grant select on public.arcade_runs to authenticated;
create policy arcade_runs_own on public.arcade_runs for select using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 5. Wallet: the comets total. Lifetime earned; no spend sink in v1, so
-- total = balance. guest_merged_at non-null means the one-time merge is spent.
-- -----------------------------------------------------------------------------
create table public.arcade_wallets (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  comets          bigint not null default 0,
  guest_merged_at timestamptz,
  updated_at      timestamptz not null default now()
);

alter table public.arcade_wallets enable row level security;
revoke all on public.arcade_wallets from anon, authenticated;
grant select on public.arcade_wallets to authenticated;
create policy arcade_wallets_own on public.arcade_wallets for select using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 6. Per-game stats: profile totals and bests. Maintained transactionally in
-- the submit RPC; derivable from arcade_runs as an audit query, except streaks.
-- -----------------------------------------------------------------------------
create table public.arcade_stats (
  user_id     uuid not null references auth.users(id) on delete cascade,
  game_slug   text not null references public.arcade_games(slug),
  plays       int not null default 0,
  best_score  int not null default 0,
  streak      int not null default 0,
  best_streak int not null default 0,
  last_day    int,
  primary key (user_id, game_slug)
);

alter table public.arcade_stats enable row level security;
revoke all on public.arcade_stats from anon, authenticated;
grant select on public.arcade_stats to authenticated;
create policy arcade_stats_own on public.arcade_stats for select using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 7. Day aggregates: plays and wins per game per day, for the SSR "N played"
-- line (shown only at >= 50 plays; that gate is the caller's job). Incremented
-- inside the submit RPC for credited live runs only. Server-fn reads only.
-- -----------------------------------------------------------------------------
create table public.arcade_day_agg (
  game_slug text not null references public.arcade_games(slug),
  day_key   int not null,
  plays     int not null default 0,
  wins      int not null default 0,
  primary key (game_slug, day_key)
);

alter table public.arcade_day_agg enable row level security;
revoke all on public.arcade_day_agg from anon, authenticated;

grant all on public.arcade_games, public.arcade_items, public.arcade_daily,
  public.arcade_runs, public.arcade_wallets, public.arcade_stats,
  public.arcade_day_agg to service_role;

-- -----------------------------------------------------------------------------
-- 8. Country on profiles: ISO 3166 alpha-2, nullable, user-clearable in
-- /account. Existing update-own RLS is acceptable here; picking your own
-- country is the feature, not an exploit.
-- -----------------------------------------------------------------------------
alter table public.profiles add column country text check (country ~ '^[A-Z]{2}$');

-- =============================================================================
-- RPCs. All security definer, search_path pinned, return jsonb with an 'error'
-- key instead of raising (night_* convention). Inputs validated server-side.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Submit a finished run. First credited run per (user, game, day) earns
-- comets; a same-day resubmit only raises the recorded score. Comets are
-- computed here from the registry, never taken from the client. p_country is
-- a CDN geo hint: it fills profiles.country only when the user has not set
-- one, and the profile value always wins.
-- -----------------------------------------------------------------------------
create or replace function public.arcade_submit_run(
  p_game_slug text,
  p_day_key int,
  p_score int,
  p_duration_ms int,
  p_won boolean default false,
  p_country text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_game record;
  v_comets int;
  v_wallet bigint;
  v_stats record;
begin
  if v_uid is null then return jsonb_build_object('error', 'not_signed_in'); end if;

  select * into v_game from arcade_games where slug = p_game_slug and active;
  if not found then return jsonb_build_object('error', 'unknown_game'); end if;

  if p_day_key is distinct from arcade_day() then
    return jsonb_build_object('error', 'stale_day');
  end if;
  if p_score is null or p_score < 0 or p_score > v_game.max_score then
    return jsonb_build_object('error', 'bad_score');
  end if;
  if p_duration_ms is null or p_duration_ms < v_game.min_duration_ms or p_duration_ms > 86400000 then
    return jsonb_build_object('error', 'bad_duration');
  end if;

  v_comets := arcade_comets(p_score, v_game.max_score, v_game.daily_comet_cap, v_game.payout);

  insert into arcade_runs (user_id, game_slug, day_key, score, comets, duration_ms, source)
  values (v_uid, p_game_slug, p_day_key, p_score, v_comets, p_duration_ms, 'live')
  on conflict (user_id, game_slug, day_key) do nothing;

  if not found then
    -- Already credited today: raise the recorded score, credit nothing.
    update arcade_runs set score = greatest(score, p_score)
      where user_id = v_uid and game_slug = p_game_slug and day_key = p_day_key;
    update arcade_stats set best_score = greatest(best_score, p_score)
      where user_id = v_uid and game_slug = p_game_slug
      returning * into v_stats;
    return jsonb_build_object(
      'duplicate', true,
      'comets', 0,
      'wallet', (select comets from arcade_wallets where user_id = v_uid),
      'best_score', coalesce(v_stats.best_score, p_score),
      'streak', coalesce(v_stats.streak, 0),
      'best_streak', coalesce(v_stats.best_streak, 0)
    );
  end if;

  insert into arcade_wallets (user_id, comets)
  values (v_uid, v_comets)
  on conflict (user_id) do update
    set comets = arcade_wallets.comets + excluded.comets, updated_at = now()
  returning comets into v_wallet;

  insert into arcade_stats (user_id, game_slug, plays, best_score, streak, best_streak, last_day)
  values (v_uid, p_game_slug, 1, p_score, 1, 1, p_day_key)
  on conflict (user_id, game_slug) do update set
    plays = arcade_stats.plays + 1,
    best_score = greatest(arcade_stats.best_score, excluded.best_score),
    streak = case when arcade_stats.last_day = excluded.last_day - 1
                  then arcade_stats.streak + 1 else 1 end,
    best_streak = greatest(arcade_stats.best_streak,
                  case when arcade_stats.last_day = excluded.last_day - 1
                       then arcade_stats.streak + 1 else 1 end),
    last_day = excluded.last_day
  returning * into v_stats;

  insert into arcade_day_agg (game_slug, day_key, plays, wins)
  values (p_game_slug, p_day_key, 1, case when coalesce(p_won, false) then 1 else 0 end)
  on conflict (game_slug, day_key) do update set
    plays = arcade_day_agg.plays + 1,
    wins = arcade_day_agg.wins + excluded.wins;

  if p_country is not null and p_country ~ '^[A-Z]{2}$' then
    update profiles set country = p_country where id = v_uid and country is null;
  end if;

  return jsonb_build_object(
    'duplicate', false,
    'comets', v_comets,
    'wallet', v_wallet,
    'best_score', v_stats.best_score,
    'streak', v_stats.streak,
    'best_streak', v_stats.best_streak
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- One-time guest merge. Inserts each plausible localStorage run with
-- source='guest_merge' (the PK eats duplicates against signed-in play), then
-- credits the wallet with the recomputed sum, capped three ways: the claimed
-- client total, days-since-launch times the sum of daily caps, and a hard
-- 2000. Merged runs update plays and bests, never streaks, never boards.
-- -----------------------------------------------------------------------------
create or replace function public.arcade_merge_guest(
  p_runs jsonb,
  p_client_total int default 0
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_merged timestamptz;
  v_today int := arcade_day();
  v_run jsonb;
  v_game record;
  v_d int;
  v_s int;
  v_ms int;
  v_comets int;
  v_accepted int := 0;
  v_skipped int := 0;
  v_sum int := 0;
  v_plausible int;
  v_credited int;
begin
  if v_uid is null then return jsonb_build_object('error', 'not_signed_in'); end if;
  if p_runs is null or jsonb_typeof(p_runs) <> 'array' then
    return jsonb_build_object('error', 'bad_input');
  end if;
  if jsonb_array_length(p_runs) > 200 then
    return jsonb_build_object('error', 'too_many_runs');
  end if;

  insert into arcade_wallets (user_id) values (v_uid) on conflict (user_id) do nothing;
  select guest_merged_at into v_merged from arcade_wallets where user_id = v_uid for update;
  if v_merged is not null then
    return jsonb_build_object('already_merged', true, 'credited', 0,
      'accepted', 0, 'skipped', jsonb_array_length(p_runs));
  end if;

  for v_run in select * from jsonb_array_elements(p_runs) loop
    begin
      v_d := (v_run->>'d')::int;
      v_s := (v_run->>'s')::int;
      v_ms := (v_run->>'ms')::int;
    exception when others then
      v_skipped := v_skipped + 1;
      continue;
    end;

    select * into v_game from arcade_games where slug = v_run->>'g' and active;
    if not found
      or v_d is null or v_d < 1 or v_d > v_today or v_d <= v_today - 90
      or v_s is null or v_s < 0 or v_s > v_game.max_score
      or v_ms is null or v_ms < v_game.min_duration_ms or v_ms > 86400000
    then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_comets := arcade_comets(v_s, v_game.max_score, v_game.daily_comet_cap, v_game.payout);

    insert into arcade_runs (user_id, game_slug, day_key, score, comets, duration_ms, source)
    values (v_uid, v_game.slug, v_d, v_s, v_comets, v_ms, 'guest_merge')
    on conflict (user_id, game_slug, day_key) do nothing;

    if found then
      v_accepted := v_accepted + 1;
      v_sum := v_sum + v_comets;
      insert into arcade_stats (user_id, game_slug, plays, best_score)
      values (v_uid, v_game.slug, 1, v_s)
      on conflict (user_id, game_slug) do update set
        plays = arcade_stats.plays + 1,
        best_score = greatest(arcade_stats.best_score, excluded.best_score);
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  v_plausible := greatest(v_today, 1)
    * (select coalesce(sum(daily_comet_cap), 0)::int from arcade_games where active);
  v_credited := least(v_sum, v_plausible, 2000);
  if p_client_total is not null and p_client_total > 0 then
    v_credited := least(v_credited, p_client_total);
  end if;

  update arcade_wallets
    set comets = comets + v_credited, guest_merged_at = now(), updated_at = now()
    where user_id = v_uid;

  return jsonb_build_object('already_merged', false, 'credited', v_credited,
    'accepted', v_accepted, 'skipped', v_skipped);
end;
$$;

-- -----------------------------------------------------------------------------
-- Weekly leaderboard: comets earned per user in one ISO week, summed from
-- live runs (day_key range derived from the week's Monday). Public profiles
-- only in rows; the caller always gets their own 'you' row with rank computed
-- against the visible field. scope='country' filters to the caller's
-- profiles.country.
-- -----------------------------------------------------------------------------
create or replace function public.arcade_weekly_board(
  p_scope text default 'global',
  p_week_key text default null,
  p_limit int default 50
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_week text := coalesce(p_week_key, arcade_week());
  v_monday date;
  v_day_lo int;
  v_day_hi int;
  v_limit int := greatest(1, least(coalesce(p_limit, 50), 50));
  v_country text := null;
  v_rows jsonb;
  v_my int;
  v_you jsonb := null;
begin
  if p_scope not in ('global', 'country') then
    return jsonb_build_object('error', 'bad_scope');
  end if;
  if v_week !~ '^\d{4}-W\d{2}$' then
    return jsonb_build_object('error', 'bad_week');
  end if;

  v_monday := to_date(v_week, 'IYYY-"W"IW');
  v_day_lo := (v_monday - date '2026-08-18') + 1;
  v_day_hi := v_day_lo + 6;

  if p_scope = 'country' then
    if v_uid is null then return jsonb_build_object('error', 'not_signed_in'); end if;
    select country into v_country from profiles where id = v_uid;
    if v_country is null then return jsonb_build_object('error', 'no_country'); end if;
  end if;

  with totals as (
    select r.user_id, sum(r.comets)::int as comets
    from arcade_runs r
    where r.source = 'live' and r.day_key between v_day_lo and v_day_hi
    group by r.user_id
  ),
  eligible as (
    select t.user_id, t.comets, p.username::text as username, p.display_name,
           p.avatar_preset, p.country
    from totals t
    join profiles p on p.id = t.user_id
    where p.is_public and (v_country is null or p.country = v_country)
  ),
  ranked as (
    select e.*, rank() over (order by e.comets desc) as rank from eligible e
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'rank', top.rank, 'username', top.username, 'display_name', top.display_name,
      'avatar_preset', top.avatar_preset, 'country', top.country, 'comets', top.comets
    ) order by top.rank, top.username), '[]'::jsonb)
  into v_rows
  from (select * from ranked order by rank, username limit v_limit) top;

  if v_uid is not null then
    select sum(r.comets)::int into v_my
    from arcade_runs r
    where r.user_id = v_uid and r.source = 'live'
      and r.day_key between v_day_lo and v_day_hi;
    if v_my is not null then
      v_you := jsonb_build_object(
        'comets', v_my,
        'rank', 1 + (
          select count(*)
          from (
            select r.user_id
            from arcade_runs r
            join profiles p on p.id = r.user_id
            where r.source = 'live' and r.day_key between v_day_lo and v_day_hi
              and p.is_public and (v_country is null or p.country = v_country)
              and r.user_id <> v_uid
            group by r.user_id
            having sum(r.comets) > v_my
          ) better
        )
      );
    end if;
  end if;

  return jsonb_build_object(
    'week_key', v_week,
    'scope', p_scope,
    'country', v_country,
    'rows', v_rows,
    'you', v_you
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Per-game day board: live scores for one game on one day, plus the day's
-- play count. This IS the 8PM Screening board; the page polls it while open.
-- -----------------------------------------------------------------------------
create or replace function public.arcade_day_board(
  p_game_slug text,
  p_day_key int default null,
  p_limit int default 50
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_day int := coalesce(p_day_key, arcade_day());
  v_limit int := greatest(1, least(coalesce(p_limit, 50), 100));
  v_rows jsonb;
  v_agg record;
  v_mine record;
  v_you jsonb := null;
begin
  if not exists (select 1 from arcade_games where slug = p_game_slug) then
    return jsonb_build_object('error', 'unknown_game');
  end if;
  if v_day < 1 or v_day > arcade_day() then
    return jsonb_build_object('error', 'bad_day');
  end if;

  with runs as (
    select r.user_id, r.score, r.created_at
    from arcade_runs r
    where r.game_slug = p_game_slug and r.day_key = v_day and r.source = 'live'
  ),
  eligible as (
    select ru.score, ru.created_at, p.username::text as username, p.display_name,
           p.avatar_preset, p.country
    from runs ru
    join profiles p on p.id = ru.user_id
    where p.is_public
  ),
  ranked as (
    select e.*, rank() over (order by e.score desc) as rank from eligible e
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'rank', top.rank, 'username', top.username, 'display_name', top.display_name,
      'avatar_preset', top.avatar_preset, 'country', top.country, 'score', top.score
    ) order by top.rank, top.created_at), '[]'::jsonb)
  into v_rows
  from (select * from ranked order by rank, created_at limit v_limit) top;

  select plays, wins into v_agg from arcade_day_agg
    where game_slug = p_game_slug and day_key = v_day;

  if v_uid is not null then
    select score into v_mine from arcade_runs
      where user_id = v_uid and game_slug = p_game_slug
        and day_key = v_day and source = 'live';
    if found then
      v_you := jsonb_build_object(
        'score', v_mine.score,
        'rank', 1 + (
          select count(*) from arcade_runs r
          join profiles p on p.id = r.user_id
          where r.game_slug = p_game_slug and r.day_key = v_day and r.source = 'live'
            and p.is_public and r.user_id <> v_uid and r.score > v_mine.score
        )
      );
    end if;
  end if;

  return jsonb_build_object(
    'game_slug', p_game_slug,
    'day_key', v_day,
    'plays', coalesce(v_agg.plays, 0),
    'wins', coalesce(v_agg.wins, 0),
    'rows', v_rows,
    'you', v_you
  );
end;
$$;

revoke all on function public.arcade_submit_run(text, int, int, int, boolean, text) from public, anon, authenticated;
grant execute on function public.arcade_submit_run(text, int, int, int, boolean, text) to authenticated;
revoke all on function public.arcade_merge_guest(jsonb, int) from public, anon, authenticated;
grant execute on function public.arcade_merge_guest(jsonb, int) to authenticated;
revoke all on function public.arcade_weekly_board(text, text, int) from public;
grant execute on function public.arcade_weekly_board(text, text, int) to anon, authenticated;
revoke all on function public.arcade_day_board(text, int, int) from public;
grant execute on function public.arcade_day_board(text, int, int) to anon, authenticated;

-- =============================================================================
-- Registry seed: the 11 launch games. max_score is the plausibility ceiling
-- for a submitted score, min_duration_ms the floor for a submitted duration,
-- daily_comet_cap the payout for a max-score run before the perfect bonus.
-- items_per_day > 0 marks games fed from arcade_items; 0 means the game
-- derives its content from media directly.
-- =============================================================================
insert into public.arcade_games (slug, name, active, max_score, min_duration_ms, daily_comet_cap, items_per_day, payout) values
  ('balasaurdle',    'Balasaurdle',       true, 100,  15000, 60,  0, '{"floor_score": 10, "perfect_bonus": 10}'),
  ('quote-match',    'Quote Match',       true, 100,  8000,  50, 10, '{"floor_score": 10, "perfect_bonus": 5}'),
  ('taglines',       'Taglines',          true, 100,  8000,  50,  0, '{"floor_score": 10, "perfect_bonus": 5}'),
  ('casting-call',   'Casting Call',      true, 100,  8000,  50,  0, '{"floor_score": 10, "perfect_bonus": 5}'),
  ('link-up',        'Link Up',           true, 100,  10000, 50,  0, '{"floor_score": 10, "perfect_bonus": 5}'),
  ('timeline',       'Timeline',          true, 100,  8000,  40,  0, '{"floor_score": 10, "perfect_bonus": 5}'),
  ('screening',      'The 8PM Screening', true, 1000, 15000, 100, 10, '{"floor_score": 100, "perfect_bonus": 10}'),
  ('emoji',          'Emoji',             true, 100,  8000,  50, 10, '{"floor_score": 10, "perfect_bonus": 5}'),
  ('speed-sort',     'Speed Sort',        true, 100,  3000,  40,  0, '{"floor_score": 10, "perfect_bonus": 5}'),
  ('sequel-or-fake', 'Sequel or Fake',    true, 100,  8000,  50, 10, '{"floor_score": 10, "perfect_bonus": 5}'),
  ('poster-reveal',  'Poster Reveal',     true, 100,  5000,  60,  0, '{"floor_score": 10, "perfect_bonus": 10}');
