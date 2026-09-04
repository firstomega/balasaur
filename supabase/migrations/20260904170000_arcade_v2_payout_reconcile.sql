-- Arcade v2: reconcile the payout model between client and server.
--
-- v1 computed comets server-side from a linear score formula, while the
-- client's payout tables (src/lib/arcade/comets.ts) are per-game and not
-- linear in the submitted score, so the end-screen breakdown and the wallet
-- could disagree (a clean taglines board showed 15 and credited 55).
--
-- v2 makes the client breakdown the credited truth, bounded by the registry:
-- the submit RPC accepts p_comets and clamps it to daily_comet_cap, which is
-- now set to each game's exact maximum client payout. The score keeps its
-- 0..max_score scale for day boards and bests. The guest merge accepts the
-- {g, d, c} claim shape the client stores (comets per game per day), with
-- the same per-game clamp. The day board rows gain duration_ms so the
-- Screening snippet can show times.

-- ---------------------------------------------------------------------------
-- 1. Registry: daily_comet_cap = the game's exact max client payout;
--    min_duration_ms lowered where a fast legitimate run could finish early.
-- ---------------------------------------------------------------------------
update public.arcade_games set daily_comet_cap = 12, min_duration_ms = 3000  where slug = 'balasaurdle';
update public.arcade_games set daily_comet_cap = 12, min_duration_ms = 3000  where slug = 'poster-reveal';
update public.arcade_games set daily_comet_cap = 15, min_duration_ms = 4000  where slug = 'taglines';
update public.arcade_games set daily_comet_cap = 15, min_duration_ms = 4000  where slug = 'quote-match';
update public.arcade_games set daily_comet_cap = 16, min_duration_ms = 6000  where slug = 'casting-call';
update public.arcade_games set daily_comet_cap = 8,  min_duration_ms = 6000  where slug = 'link-up';
update public.arcade_games set daily_comet_cap = 15, min_duration_ms = 5000  where slug = 'timeline';
update public.arcade_games set daily_comet_cap = 40, min_duration_ms = 15000 where slug = 'screening';
update public.arcade_games set daily_comet_cap = 15, min_duration_ms = 4000  where slug = 'emoji';
update public.arcade_games set daily_comet_cap = 35, min_duration_ms = 3000  where slug = 'speed-sort';
update public.arcade_games set daily_comet_cap = 15, min_duration_ms = 5000  where slug = 'sequel-or-fake';

-- ---------------------------------------------------------------------------
-- 2. Submit: accept the client-computed comets, clamped to the cap. The
--    signature changes, so the v1 function is dropped, not overloaded.
-- ---------------------------------------------------------------------------
drop function if exists public.arcade_submit_run(text, int, int, int, boolean, text);

create or replace function public.arcade_submit_run(
  p_game_slug text,
  p_day_key int,
  p_score int,
  p_duration_ms int,
  p_won boolean default false,
  p_country text default null,
  p_comets int default null
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

  if p_comets is not null then
    v_comets := least(greatest(p_comets, 0), v_game.daily_comet_cap);
  else
    v_comets := arcade_comets(p_score, v_game.max_score, v_game.daily_comet_cap, v_game.payout);
  end if;

  insert into arcade_runs (user_id, game_slug, day_key, score, comets, duration_ms, source)
  values (v_uid, p_game_slug, p_day_key, p_score, v_comets, p_duration_ms, 'live')
  on conflict (user_id, game_slug, day_key) do nothing;

  if not found then
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

revoke all on function public.arcade_submit_run(text, int, int, int, boolean, text, int) from public, anon, authenticated;
grant execute on function public.arcade_submit_run(text, int, int, int, boolean, text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Guest merge: the client blob stores comets per (game, day), not scores,
--    so runs arrive as {g, d, c}. Each claim is clamped to the game's cap;
--    the old {g, d, s, ms} shape still works for any stale client.
-- ---------------------------------------------------------------------------
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
  v_c int;
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
      v_c := (v_run->>'c')::int;
      v_s := (v_run->>'s')::int;
      v_ms := (v_run->>'ms')::int;
    exception when others then
      v_skipped := v_skipped + 1;
      continue;
    end;

    select * into v_game from arcade_games where slug = v_run->>'g' and active;
    if not found
      or v_d is null or v_d < 1 or v_d > v_today or v_d <= v_today - 90
    then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if v_c is not null then
      -- Comet claim from the client blob: clamp to the game's cap.
      if v_c < 0 then v_skipped := v_skipped + 1; continue; end if;
      v_comets := least(v_c, v_game.daily_comet_cap);
      v_s := least(coalesce(v_s, 0), v_game.max_score);
      v_ms := coalesce(v_ms, v_game.min_duration_ms);
    else
      -- Legacy score-shaped claim.
      if v_s is null or v_s < 0 or v_s > v_game.max_score
        or v_ms is null or v_ms < v_game.min_duration_ms or v_ms > 86400000
      then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      v_comets := arcade_comets(v_s, v_game.max_score, v_game.daily_comet_cap, v_game.payout);
    end if;

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

-- ---------------------------------------------------------------------------
-- 4. Day board rows carry duration_ms (the Screening snippet shows times).
-- ---------------------------------------------------------------------------
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
    select r.user_id, r.score, r.duration_ms, r.created_at
    from arcade_runs r
    where r.game_slug = p_game_slug and r.day_key = v_day and r.source = 'live'
  ),
  eligible as (
    select ru.score, ru.duration_ms, ru.created_at, p.username::text as username,
           p.display_name, p.avatar_preset, p.country
    from runs ru
    join profiles p on p.id = ru.user_id
    where p.is_public
  ),
  ranked as (
    select e.*, rank() over (order by e.score desc) as rank from eligible e
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'rank', top.rank, 'username', top.username, 'display_name', top.display_name,
      'avatar_preset', top.avatar_preset, 'country', top.country, 'score', top.score,
      'duration_ms', top.duration_ms
    ) order by top.rank, top.created_at), '[]'::jsonb)
  into v_rows
  from (select * from ranked order by rank, created_at limit v_limit) top;

  select plays, wins into v_agg from arcade_day_agg
    where game_slug = p_game_slug and day_key = v_day;

  if v_uid is not null then
    select score, duration_ms into v_mine from arcade_runs
      where user_id = v_uid and game_slug = p_game_slug
        and day_key = v_day and source = 'live';
    if found then
      v_you := jsonb_build_object(
        'score', v_mine.score,
        'duration_ms', v_mine.duration_ms,
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

revoke all on function public.arcade_day_board(text, int, int) from public;
grant execute on function public.arcade_day_board(text, int, int) to anon, authenticated;
