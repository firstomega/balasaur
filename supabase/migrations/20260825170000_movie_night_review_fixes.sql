-- Record of changes already applied to the live project
-- (movie_night_state_shared_prefs, movie_night_review_fixes,
-- movie_night_recommender_v2_2). Follow-ups to the Movie Night backbone from
-- a three-lens adversarial review (SQL correctness, product-intent fidelity,
-- abuse) plus the live-selection requirement.
--
-- What changed and why:
--   night_state      members now include each member's picks, so every phone
--                    renders live rings on the chips other people chose, and
--                    a refresh rebuilds the same picture from the database.
--   night_create     insert is the authoritative code-collision test (retry
--                    on unique_violation), plus an active-rooms circuit
--                    breaker; per-caller rate limiting needs client identity
--                    SQL does not have.
--   night_join       room row locked so concurrent joins cannot overshoot
--                    the 8-member cap.
--   night_set_prefs  signals MERGE instead of replace (a wizard section
--                    saving its own key no longer erases the others; an
--                    explicit JSON null clears one key); arrays deduped and
--                    element sizes bounded so duplicates cannot multiply
--                    scoring weight (+60 per duplicated watchlist id was a
--                    rankable exploit).
--   night_roll       room row locked BEFORE recommending, so a double-tap
--                    cannot produce two rolls with the same titles; no
--                    rolling while a reveal is pending; 40-roll lifetime cap.
--   night_mark_watched  same caps and bounds as set_prefs (it had none).
--   night_set_room   new: host can change media type and services between
--                    rolls, which adjust-then-re-roll required.
--   night_recommend  v2.2: genre points count MEMBERS, not overlapping
--                    genres, restoring the documented +12/-15 calibration;
--                    watchlist wants bypass the quality floors (the member
--                    already vetted the title); crowd groups sum where both
--                    match; vibe identity keys on member id, so two people
--                    both named Anonymous Raptor are two people.
--
-- Accepted as designed, for the record: room codes are the invitation, so
-- anyone holding one can join, appear in the lobby, and shape the roll; the
-- roll's reason chips show which member wanted what, because the room is a
-- trust circle and the transparency IS the product. Enumeration economics:
-- 31^5 codes (~28.6M) against rooms that live 24 hours.

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
        'is_you', m.member_token = p_member_token,
        'genres_want', to_jsonb(m.genres_want),
        'genres_less', to_jsonb(m.genres_less),
        'signals', m.signals
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
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if p_mode not in ('solo','group') or p_media_type not in ('movie','tv','either') then
    return jsonb_build_object('error', 'bad_input');
  end if;
  if (select count(*) from night_rooms where expires_at > now()) >= 10000 then
    return jsonb_build_object('error', 'at_capacity');
  end if;
  loop
    select string_agg(substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1), '')
      into v_code from generate_series(1, 5);
    begin
      insert into night_rooms (code, mode, media_type, services, host_token)
      values (v_code, p_mode, p_media_type, coalesce(p_services[1:6], '{}'), v_token)
      returning id into v_room_id;
      exit;
    exception when unique_violation then
      -- Collided with a concurrent create; roll a new code.
    end;
  end loop;

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
  select * into v_room from night_rooms
    where code = upper(trim(p_code)) and expires_at > now()
    for update;
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
  v_new jsonb;
  v_clear text[];
  v_watched text[];
  v_want_ids text[];
begin
  select m.* into v_member from night_members m
    join night_rooms r on r.id = m.room_id and r.expires_at > now()
    where m.member_token = p_member_token;
  if not found then return jsonb_build_object('error', 'not_member'); end if;

  if p_genres_want is null then v_want := v_member.genres_want;
  else
    v_want := coalesce((select (array_agg(distinct g))[1:3]
      from unnest(p_genres_want) g where length(g) between 1 and 40), '{}');
  end if;
  if p_genres_less is null then v_less := v_member.genres_less;
  else
    v_less := coalesce((select (array_agg(distinct g))[1:3]
      from unnest(p_genres_less) g where length(g) between 1 and 40), '{}');
  end if;
  -- A genre in both lists counts as preferred: the stronger statement wins.
  v_less := (select coalesce(array_agg(g), '{}') from unnest(v_less) g where not (g = any(v_want)));

  if p_signals is null then
    v_signals := v_member.signals;
  else
    v_new := (
      select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
      from jsonb_each_text(p_signals) e(k, v)
      where (k = 'era'    and v in ('new','modern','classic'))
         or (k = 'length' and v in ('short','standard','long'))
         or (k = 'crowd'  and v in ('mainstream','hidden'))
         or (k = 'vibe'   and v in ('true_story','edge','another_world','crime','comfort','big'))
    );
    v_clear := coalesce((select array_agg(k) from jsonb_each(p_signals) e(k, v)
      where v = 'null'::jsonb
        and k in ('era','length','crowd','vibe')), '{}');
    v_signals := (v_member.signals || v_new) - v_clear;
  end if;

  if p_watched_ids is null then v_watched := v_member.watched_ids;
  else
    v_watched := coalesce((select (array_agg(distinct x))[1:3000]
      from unnest(p_watched_ids) x where length(x) between 1 and 40), '{}');
  end if;
  if p_want_ids is null then v_want_ids := v_member.want_ids;
  else
    v_want_ids := coalesce((select (array_agg(distinct x))[1:500]
      from unnest(p_want_ids) x where length(x) between 1 and 40), '{}');
  end if;

  update night_members set
    genres_want = v_want,
    genres_less = v_less,
    signals = v_signals,
    watched_ids = v_watched,
    want_ids = v_want_ids,
    ready = coalesce(p_ready, ready)
  where member_token = p_member_token;

  return jsonb_build_object('ok', true);
end;
$$;

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
    where r.expires_at > now()
    for update of r;
  if not found then return jsonb_build_object('error', 'not_member'); end if;
  if v_room.host_token <> p_member_token then return jsonb_build_object('error', 'host_only'); end if;
  if v_room.reveal_at is not null and v_room.reveal_at > now() then
    return jsonb_build_object('error', 'reveal_pending');
  end if;
  if v_room.roll_seq >= 40 then return jsonb_build_object('error', 'roll_limit'); end if;

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

create or replace function public.night_mark_watched(p_member_token uuid, p_media_id text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_ok integer;
begin
  if p_media_id is null or length(p_media_id) not between 1 and 40 then
    return jsonb_build_object('error', 'bad_input');
  end if;
  update night_members m set
    watched_ids = (select (array_agg(distinct x))[1:3000] from unnest(m.watched_ids || p_media_id) x),
    want_ids = array_remove(m.want_ids, p_media_id)
  from night_rooms r
  where r.id = m.room_id and r.expires_at > now() and m.member_token = p_member_token;
  get diagnostics v_ok = row_count;
  return jsonb_build_object('ok', v_ok = 1);
end;
$$;

create or replace function public.night_set_room(
  p_member_token uuid,
  p_media_type text default null,
  p_services text[] default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_room record;
begin
  select r.* into v_room from night_rooms r
    join night_members m on m.room_id = r.id and m.member_token = p_member_token
    where r.expires_at > now()
    for update of r;
  if not found then return jsonb_build_object('error', 'not_member'); end if;
  if v_room.host_token <> p_member_token then return jsonb_build_object('error', 'host_only'); end if;
  if p_media_type is not null and p_media_type not in ('movie','tv','either') then
    return jsonb_build_object('error', 'bad_input');
  end if;

  update night_rooms set
    media_type = coalesce(p_media_type, media_type),
    services = coalesce(p_services[1:6], services)
  where id = v_room.id;
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.night_set_room(uuid, text, text[]) to anon, authenticated;

-- Recommender v2.2. Scoring: +60 per member with the title on their
-- watchlist, +12 per member whose preferred genres overlap, -15 per member
-- whose less-preferred genres overlap, +8 per member per matching era /
-- length / crowd answer, +10 per member whose vibe maps to a title theme,
-- +0.6 x Balasaur Score, small popularity tiebreak. Hard constraints only:
-- watched, previously rolled, media type, services when set, content-safety
-- tiers. Quality floors (60/200 then 50/50 then 1/0) relax if the pool runs
-- dry and never apply to a title someone explicitly wants.
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
      select id, display_name, genres_want, genres_less, signals, watched_ids, want_ids
      from night_members where room_id = p_room_id
    ),
    gpref as (
      select g as genre, array_agg(display_name) as names
      from m, unnest(genres_want) g group by 1
    ),
    gless as (
      select g as genre, count(distinct m.id)::int as n
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
      select m.id, vm.vibe, vm.themes
      from m join vibe_map vm on vm.vibe = m.signals->>'vibe'
    ),
    scored as (
      select
        md.media_id, md.title, md.media_type, md.year, md.poster_url,
        md.rating_balasaur, md.genres, md.streaming, md.film_length_minutes,
        md.popularity,
        coalesce(w.names, '{}') as wanted_by,
        (select count(*)::int from m where m.genres_want && md.genres) as pref_n,
        (select count(*)::int from m where m.genres_less && md.genres) as less_n,
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
        coalesce((select sum(c.n)::int from csig c where
            (c.v = 'mainstream' and coalesce(md.vote_count, 0) >= 5000) or
            (c.v = 'hidden'     and coalesce(md.popularity, 0) < 15 and md.rating_balasaur >= 70)
          ), 0) as crowd_n,
        (select count(distinct mv.id)::int from mvibe mv where mv.themes && md.themes) as vibe_n,
        (select coalesce(jsonb_agg(distinct mv.vibe), '[]'::jsonb) from mvibe mv where mv.themes && md.themes) as vibe_hits
      from media md
      left join wants w on w.mid = md.media_id
      where md.sensitive is not true
        and md.suggestive is not true
        and md.poster_url is not null
        and md.rating_balasaur is not null
        and (
          w.names is not null
          or (md.rating_balasaur >= v_floor.min_score and coalesce(md.vote_count, 0) >= v_floor.min_votes)
        )
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
    'meta', jsonb_build_object('algo_version', 2.2, 'passes_used', v_passes_used)
  );
end;
$$;

revoke all on function public.night_recommend(uuid, integer) from public, anon, authenticated;
