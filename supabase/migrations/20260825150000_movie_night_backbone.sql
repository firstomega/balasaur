-- Record of changes already applied to the live Supabase project
-- (movie_night_tables, movie_night_recommender, movie_night_rpcs,
-- movie_night_recommender_want_weight, movie_night_set_prefs_fix).
-- The repo file is the record; Lovable Cloud does not auto-apply it.
--
-- =============================================================================
-- MOVIE NIGHT BACKBONE
-- =============================================================================
--
-- Solo and group are the same machinery. A solo "room" has one member and
-- skips the lobby; one code path means the recommender, roll history, winner
-- record and analytics are identical for both.
--
-- Access model: browsers never touch these tables. RLS is on with no
-- policies and table grants are revoked; every operation goes through
-- security-definer functions. Knowing a room code lets you JOIN (the code is
-- the invitation); every WRITE requires the member_token handed out at join
-- time, which lives only in that member's browser.
--
-- Preference model, deliberately not veto-based: preferred genres pull a
-- title up, less-preferred push it down, and nothing is excluded outright.
-- One member's "less preferred" loses to another's watchlist want plus
-- quality, which is what a couch negotiation actually looks like. The only
-- hard constraints are watched titles, previously rolled titles, the room's
-- media type, its streaming services when set, and the content-safety tiers.
--
-- Realtime plan (client work, not in this migration): one Supabase Realtime
-- channel per room code. Presence carries who is in the room and, throttled,
-- each member's pending selections so every phone shows live chip states.
-- Broadcast carries a "changed" poke after any RPC write; phones refetch via
-- night_state. The database is the truth; the channel is a doorbell, so a
-- refresh or a dropped connection rejoins cleanly.

create table public.night_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  mode text not null default 'group' check (mode in ('solo','group')),
  status text not null default 'lobby' check (status in ('lobby','results')),
  media_type text not null default 'either' check (media_type in ('movie','tv','either')),
  -- Streaming services the group actually has. Empty = no constraint. A hard
  -- filter when set: a recommendation nobody can stream is a dead end at 9pm.
  services text[] not null default '{}',
  host_token uuid not null,
  -- The synchronized-reveal timestamp. The server computes instantly, stamps
  -- a moment a few seconds ahead, and every phone animates until then and
  -- flips together. The suspense delay IS the sync mechanism.
  reveal_at timestamptz,
  roll_seq integer not null default 0,
  -- Closure: the title the group settled on, and who marked it. The single
  -- most valuable data point a session produces.
  winner_media_id text,
  winner_name text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);

create table public.night_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.night_rooms(id) on delete cascade,
  member_token uuid not null unique default gen_random_uuid(),
  display_name text not null,
  is_signed_in boolean not null default false,
  genres_want text[] not null default '{}',
  genres_less text[] not null default '{}',
  -- Optional wizard answers beyond the required screens: era, length, crowd,
  -- vibe. Whitelisted keys and values only (validated in night_set_prefs).
  -- Every answered question sharpens the roll; none is required.
  signals jsonb not null default '{}',
  -- Client-submitted, capped. Works identically for guests (localStorage) and
  -- accounts (their statuses), and means the server never has to trust a
  -- claimed user id.
  watched_ids text[] not null default '{}',
  want_ids text[] not null default '{}',
  ready boolean not null default false,
  joined_at timestamptz not null default now()
);
create index idx_night_members_room on public.night_members (room_id);

create table public.night_rolls (
  room_id uuid not null references public.night_rooms(id) on delete cascade,
  roll_seq integer not null,
  -- Full card snapshot at roll time so every phone shows identical results,
  -- plus a flat id list for cheap "never show again this session" exclusion.
  media_ids text[] not null,
  items jsonb not null,
  params jsonb not null default '{}',
  created_at timestamptz not null default now(),
  primary key (room_id, roll_seq)
);

alter table public.night_rooms enable row level security;
alter table public.night_members enable row level security;
alter table public.night_rolls enable row level security;

revoke all on public.night_rooms from anon, authenticated;
revoke all on public.night_members from anon, authenticated;
revoke all on public.night_rolls from anon, authenticated;
grant all on public.night_rooms, public.night_members, public.night_rolls to service_role;

-- =============================================================================
-- The group recommender. Internal only: called by night_roll, never a browser.
--
-- Scoring, v2 (soft preferences, no vetoes):
--   +60  per member with the title on their watchlist. A named title is the
--        most specific signal a member can give. Found by reading output at
--        +40: a watchlist pick carrying one member's less-preferred genre
--        needed ~8 rolls to surface against a deep field of generic genre
--        matches. At +60 it lands in roll one, held-back chip showing, which
--        forces the conversation the couch would have had anyway. Two
--        members' reluctance (-30) still holds it under the bubble.
--   +12  per member preferring one of the title's genres.
--   -15  per member marking one less preferred. Asymmetric on purpose:
--        disliking is felt more strongly than liking, but it is a weight,
--        not a wall.
--   +8   per member whose era / length / crowd answer the title satisfies.
--   +10  per member whose vibe maps to one of the title's themes.
--   +0.6 * Balasaur Score, so quality is the floor under everything.
--   tiny popularity tiebreak.
--
-- Vibes map to theme sets that exist in the catalog with real counts
-- (checked 2026-08-25: Based on a True Story 2068, Supernatural 1324,
-- Superhero 1303, Serial Killer 684, Holiday 821, ...).
--
-- Quality floors relax in two steps if the pool runs dry rather than
-- returning nothing: (60 score, 200 votes) then (50, 50) then (1, 0).
-- =============================================================================
create or replace function public.night_recommend(p_room_id uuid, p_limit integer default 5)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room record;
  v_items jsonb := '[]'::jsonb;
  v_picked text[] := '{}';
  v_floor record;
  v_pass integer := 0;
  v_passes_used integer := 0;
begin
  select * into v_room from night_rooms where id = p_room_id;
  if not found then
    return jsonb_build_object('items', '[]'::jsonb, 'meta', jsonb_build_object('error', 'room not found'));
  end if;

  for v_floor in select * from (values (60, 200), (50, 50), (1, 0)) f(min_score, min_votes)
  loop
    v_pass := v_pass + 1;
    exit when jsonb_array_length(v_items) >= p_limit;
    v_passes_used := v_pass;

    with m as (
      select display_name, genres_want, genres_less, signals, watched_ids, want_ids
      from night_members where room_id = p_room_id
    ),
    gpref as (
      select g as genre, count(*)::int as n, array_agg(display_name) as names
      from m, unnest(genres_want) g group by 1
    ),
    gless as (
      select g as genre, count(*)::int as n
      from m, unnest(genres_less) g group by 1
    ),
    watched as (select distinct w from m, unnest(watched_ids) w),
    wants as (
      select w as mid, array_agg(display_name) as names
      from m, unnest(want_ids) w group by 1
    ),
    prior as (
      select distinct unnest(media_ids) as mid from night_rolls where room_id = p_room_id
    ),
    esig as (
      select signals->>'era' as v, count(*)::int as n from m
      where signals->>'era' in ('new','modern','classic') group by 1
    ),
    lsig as (
      select signals->>'length' as v, count(*)::int as n from m
      where signals->>'length' in ('short','standard','long') group by 1
    ),
    csig as (
      select signals->>'crowd' as v, count(*)::int as n from m
      where signals->>'crowd' in ('mainstream','hidden') group by 1
    ),
    vibe_map(vibe, themes) as (
      values
        ('true_story',    array['Based on a True Story']),
        ('edge',          array['Serial Killer','Heist','Espionage','Conspiracy','Survival','Detective']),
        ('another_world', array['Supernatural','Magic','Dystopian','Aliens','Space','Time Travel','AI & Robots','Monsters']),
        ('crime',         array['Detective','Mafia & Mob','Legal','Prison','Heist','Serial Killer']),
        ('comfort',       array['Holiday','Coming of Age','Road Trip','Sports','High School']),
        ('big',           array['Superhero','Martial Arts','Military','Monsters'])
    ),
    mvibe as (
      select m.display_name, vm.vibe, vm.themes
      from m join vibe_map vm on vm.vibe = m.signals->>'vibe'
    ),
    scored as (
      select
        md.media_id, md.title, md.media_type, md.year, md.poster_url,
        md.rating_balasaur, md.genres, md.streaming, md.film_length_minutes,
        md.popularity,
        coalesce(w.names, '{}') as wanted_by,
        (select coalesce(sum(gp.n), 0)::int from gpref gp where gp.genre = any(md.genres)) as pref_n,
        (select coalesce(sum(gl.n), 0)::int from gless gl where gl.genre = any(md.genres)) as less_n,
        (select coalesce(jsonb_agg(jsonb_build_object('genre', gp.genre, 'members', gp.names)), '[]'::jsonb)
           from gpref gp where gp.genre = any(md.genres)) as genre_hits,
        (select coalesce(jsonb_agg(jsonb_build_object('genre', gl.genre, 'count', gl.n)), '[]'::jsonb)
           from gless gl where gl.genre = any(md.genres)) as genre_held,
        coalesce((select e.n from esig e where
            (e.v = 'new'     and md.release_date >= to_char(current_date - interval '2 years', 'YYYY-MM-DD')) or
            (e.v = 'modern'  and md.release_date >= '2000-01-01' and md.release_date < to_char(current_date - interval '2 years', 'YYYY-MM-DD')) or
            (e.v = 'classic' and md.release_date < '2000-01-01')
          limit 1), 0) as era_n,
        coalesce((select l.n from lsig l where md.media_type = 'movie' and md.film_length_minutes is not null and (
            (l.v = 'short'    and md.film_length_minutes <= 100) or
            (l.v = 'standard' and md.film_length_minutes > 100 and md.film_length_minutes <= 150) or
            (l.v = 'long'     and md.film_length_minutes > 150)
          ) limit 1), 0) as len_n,
        coalesce((select c.n from csig c where
            (c.v = 'mainstream' and coalesce(md.vote_count, 0) >= 5000) or
            (c.v = 'hidden'     and coalesce(md.popularity, 0) < 15 and md.rating_balasaur >= 70)
          limit 1), 0) as crowd_n,
        (select count(distinct mv.display_name)::int from mvibe mv where mv.themes && md.themes) as vibe_n,
        (select coalesce(jsonb_agg(distinct mv.vibe), '[]'::jsonb) from mvibe mv where mv.themes && md.themes) as vibe_hits
      from media md
      left join wants w on w.mid = md.media_id
      where md.sensitive is not true
        and md.suggestive is not true
        and md.poster_url is not null
        and md.rating_balasaur is not null
        and md.rating_balasaur >= v_floor.min_score
        and coalesce(md.vote_count, 0) >= v_floor.min_votes
        and (v_room.media_type = 'either' or md.media_type = v_room.media_type)
        and (cardinality(v_room.services) = 0 or md.streaming && v_room.services)
        and not exists (select 1 from watched ww where ww.w = md.media_id)
        and not exists (select 1 from prior pp where pp.mid = md.media_id)
        and not (md.media_id = any(v_picked))
    ),
    ranked as (
      select *,
        cardinality(wanted_by) * 60
          + pref_n * 12 - less_n * 15
          + era_n * 8 + len_n * 8 + crowd_n * 8 + vibe_n * 10
          + rating_balasaur * 0.6
          + least(coalesce(popularity, 0), 100) * 0.05
        as score
      from scored
    )
    select v_items || coalesce(jsonb_agg(item), '[]'::jsonb), v_picked || coalesce(array_agg(mid), '{}')
    into v_items, v_picked
    from (
      select r.media_id as mid,
        jsonb_build_object(
          'media_id', r.media_id, 'title', r.title, 'media_type', r.media_type,
          'year', r.year, 'poster_url', r.poster_url, 'score', r.rating_balasaur,
          'genres', to_jsonb(r.genres), 'streaming', to_jsonb(r.streaming),
          'runtime', r.film_length_minutes,
          'match', round(r.score)::int,
          'reasons', jsonb_build_object(
            'wanted_by', to_jsonb(r.wanted_by),
            'genres', r.genre_hits,
            'held_back', r.genre_held,
            'signals', jsonb_build_object('era', r.era_n, 'length', r.len_n, 'crowd', r.crowd_n, 'vibes', r.vibe_hits)
          )
        ) as item
      from ranked r
      order by r.score desc, r.rating_balasaur desc
      limit p_limit - jsonb_array_length(v_items)
    ) top;
  end loop;

  return jsonb_build_object(
    'items', v_items,
    'meta', jsonb_build_object('algo_version', 2, 'passes_used', v_passes_used)
  );
end;
$$;

revoke all on function public.night_recommend(uuid, integer) from public, anon, authenticated;

-- =============================================================================
-- Public surface. Every function validates the caller's member_token (or, for
-- create/join, mints one).
-- =============================================================================

-- Room state, sanitized: other members' tokens never leave the server.
create or replace function public.night_state(p_code text, p_member_token uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_room record;
  v_me record;
begin
  select r.* into v_room from night_rooms r where r.code = upper(trim(p_code)) and r.expires_at > now();
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  select m.* into v_me from night_members m where m.room_id = v_room.id and m.member_token = p_member_token;
  if not found then return jsonb_build_object('error', 'not_member'); end if;

  return jsonb_build_object(
    'room', jsonb_build_object(
      'code', v_room.code, 'mode', v_room.mode, 'status', v_room.status,
      'media_type', v_room.media_type, 'services', to_jsonb(v_room.services),
      'roll_seq', v_room.roll_seq, 'reveal_at', v_room.reveal_at,
      'winner_media_id', v_room.winner_media_id, 'winner_name', v_room.winner_name,
      'expires_at', v_room.expires_at
    ),
    'you', jsonb_build_object(
      'display_name', v_me.display_name, 'ready', v_me.ready,
      'genres_want', to_jsonb(v_me.genres_want), 'genres_less', to_jsonb(v_me.genres_less),
      'signals', v_me.signals, 'is_host', v_me.member_token = v_room.host_token
    ),
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'display_name', m.display_name, 'ready', m.ready,
        'is_host', m.member_token = v_room.host_token,
        'is_signed_in', m.is_signed_in,
        'is_you', m.member_token = p_member_token
      ) order by m.joined_at), '[]'::jsonb)
      from night_members m where m.room_id = v_room.id
    ),
    'roll', (
      select jsonb_build_object('seq', nr.roll_seq, 'items', nr.items, 'created_at', nr.created_at)
      from night_rolls nr where nr.room_id = v_room.id and nr.roll_seq = v_room.roll_seq
    )
  );
end;
$$;

create or replace function public.night_create(
  p_display_name text,
  p_mode text default 'group',
  p_media_type text default 'either',
  p_services text[] default '{}',
  p_is_signed_in boolean default false
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_code text;
  v_token uuid := gen_random_uuid();
  v_room_id uuid;
  v_name text := coalesce(nullif(left(trim(p_display_name), 24), ''), 'Anonymous Raptor');
  -- No O/0/I/1/L: codes get said out loud across a couch.
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if p_mode not in ('solo','group') or p_media_type not in ('movie','tv','either') then
    return jsonb_build_object('error', 'bad_input');
  end if;
  loop
    select string_agg(substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1), '')
      into v_code from generate_series(1, 5);
    exit when not exists (select 1 from night_rooms where code = v_code);
  end loop;

  insert into night_rooms (code, mode, media_type, services, host_token)
  values (v_code, p_mode, p_media_type, coalesce(p_services[1:6], '{}'), v_token)
  returning id into v_room_id;

  insert into night_members (room_id, member_token, display_name, is_signed_in)
  values (v_room_id, v_token, v_name, p_is_signed_in);

  return jsonb_build_object('member_token', v_token, 'state', night_state(v_code, v_token));
end;
$$;

create or replace function public.night_join(
  p_code text,
  p_display_name text,
  p_is_signed_in boolean default false
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_room record;
  v_token uuid;
  v_name text := coalesce(nullif(left(trim(p_display_name), 24), ''), 'Anonymous Raptor');
begin
  select * into v_room from night_rooms where code = upper(trim(p_code)) and expires_at > now();
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if v_room.mode = 'solo' then return jsonb_build_object('error', 'solo_room'); end if;
  if (select count(*) from night_members where room_id = v_room.id) >= 8 then
    return jsonb_build_object('error', 'room_full');
  end if;

  insert into night_members (room_id, display_name, is_signed_in)
  values (v_room.id, v_name, p_is_signed_in)
  returning member_token into v_token;

  return jsonb_build_object('member_token', v_token, 'state', night_state(v_room.code, v_token));
end;
$$;

-- Partial update: null leaves a field untouched, so each wizard screen saves
-- itself and the roll can happen at any point after the required screens.
-- Editable in results too, which is what makes re-roll-with-adjusted-criteria
-- work.
create or replace function public.night_set_prefs(
  p_member_token uuid,
  p_genres_want text[] default null,
  p_genres_less text[] default null,
  p_signals jsonb default null,
  p_watched_ids text[] default null,
  p_want_ids text[] default null,
  p_ready boolean default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_member record;
  v_want text[];
  v_less text[];
  v_signals jsonb;
begin
  select m.* into v_member from night_members m
    join night_rooms r on r.id = m.room_id and r.expires_at > now()
    where m.member_token = p_member_token;
  if not found then return jsonb_build_object('error', 'not_member'); end if;

  v_want := coalesce(p_genres_want[1:3], v_member.genres_want);
  v_less := coalesce(p_genres_less[1:3], v_member.genres_less);
  -- A genre in both lists counts as preferred: the stronger statement wins.
  v_less := (select coalesce(array_agg(g), '{}') from unnest(v_less) g where not (g = any(v_want)));

  if p_signals is null then
    v_signals := v_member.signals;
  else
    -- Whitelisted keys and values only; anything else is dropped. Branching
    -- (not coalesce) because an aggregate over zero rows returns a null row,
    -- which a coalesce chain silently turned into "wipe everything".
    v_signals := (
      select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
      from jsonb_each_text(p_signals) e(k, v)
      where (k = 'era'    and v in ('new','modern','classic'))
         or (k = 'length' and v in ('short','standard','long'))
         or (k = 'crowd'  and v in ('mainstream','hidden'))
         or (k = 'vibe'   and v in ('true_story','edge','another_world','crime','comfort','big'))
    );
  end if;

  update night_members set
    genres_want = v_want,
    genres_less = v_less,
    signals = v_signals,
    watched_ids = coalesce(p_watched_ids[1:3000], watched_ids),
    want_ids = coalesce(p_want_ids[1:500], want_ids),
    ready = coalesce(p_ready, ready)
  where member_token = p_member_token;

  return jsonb_build_object('ok', true);
end;
$$;

-- Roll (and re-roll: same function, prior rolls are excluded automatically).
-- Host-triggered. In solo mode the only member is the host, so the same check
-- covers both.
create or replace function public.night_roll(
  p_member_token uuid,
  p_limit integer default 5,
  p_delay_seconds integer default 4
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_room record;
  v_seq integer;
  v_result jsonb;
  v_reveal timestamptz;
  v_limit integer := greatest(1, least(coalesce(p_limit, 5), 10));
  v_delay integer := greatest(0, least(coalesce(p_delay_seconds, 4), 10));
begin
  select r.* into v_room from night_rooms r
    join night_members m on m.room_id = r.id and m.member_token = p_member_token
    where r.expires_at > now();
  if not found then return jsonb_build_object('error', 'not_member'); end if;
  if v_room.host_token <> p_member_token then return jsonb_build_object('error', 'host_only'); end if;

  v_result := night_recommend(v_room.id, v_limit);

  update night_rooms set roll_seq = roll_seq + 1, status = 'results',
    reveal_at = now() + make_interval(secs => v_delay)
  where id = v_room.id
  returning roll_seq, reveal_at into v_seq, v_reveal;

  insert into night_rolls (room_id, roll_seq, media_ids, items, params)
  values (
    v_room.id, v_seq,
    (select coalesce(array_agg(i->>'media_id'), '{}') from jsonb_array_elements(v_result->'items') i),
    v_result->'items',
    (v_result->'meta') || jsonb_build_object('limit', v_limit)
  );

  return jsonb_build_object('roll_seq', v_seq, 'reveal_at', v_reveal, 'items', v_result->'items');
end;
$$;

-- Marking watched mid-results feeds the member's exclusions, so the next
-- re-roll in the same room already knows. Watched supersedes want.
create or replace function public.night_mark_watched(p_member_token uuid, p_media_id text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_ok integer;
begin
  update night_members m set
    watched_ids = (select array_agg(distinct x) from unnest(m.watched_ids || p_media_id) x),
    want_ids = array_remove(m.want_ids, p_media_id)
  from night_rooms r
  where r.id = m.room_id and r.expires_at > now() and m.member_token = p_member_token;
  get diagnostics v_ok = row_count;
  return jsonb_build_object('ok', v_ok = 1);
end;
$$;

-- Closure: any member can mark tonight's pick, but only from what was shown.
create or replace function public.night_pick(p_member_token uuid, p_media_id text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_member record;
begin
  select m.*, r.id as rid into v_member from night_members m
    join night_rooms r on r.id = m.room_id and r.expires_at > now()
    where m.member_token = p_member_token;
  if not found then return jsonb_build_object('error', 'not_member'); end if;
  if not exists (
    select 1 from night_rolls nr
    where nr.room_id = v_member.rid and p_media_id = any(nr.media_ids)
  ) then
    return jsonb_build_object('error', 'not_in_roll');
  end if;
  update night_rooms set winner_media_id = p_media_id, winner_name = v_member.display_name
    where id = v_member.rid;
  return jsonb_build_object('ok', true);
end;
$$;

-- Rooms are ephemeral. A day past expiry they are junk, and junk accumulates
-- (see: 1.8M rows of person_cache nobody was deleting).
create or replace function public.night_cleanup()
returns integer
language plpgsql security definer set search_path = public
as $$
declare removed integer;
begin
  delete from night_rooms where expires_at < now() - interval '1 day';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.night_cleanup() from public, anon, authenticated;
grant execute on function public.night_state(text, uuid) to anon, authenticated;
grant execute on function public.night_create(text, text, text, text[], boolean) to anon, authenticated;
grant execute on function public.night_join(text, text, boolean) to anon, authenticated;
grant execute on function public.night_set_prefs(uuid, text[], text[], jsonb, text[], text[], boolean) to anon, authenticated;
grant execute on function public.night_roll(uuid, integer, integer) to anon, authenticated;
grant execute on function public.night_mark_watched(uuid, text) to anon, authenticated;
grant execute on function public.night_pick(uuid, text) to anon, authenticated;

select cron.schedule('night-rooms-cleanup', '20 10 * * *', $$select public.night_cleanup()$$);
