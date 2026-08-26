-- Movie Night follow-up, applied to the live project first and mirrored here.
--
-- 1. night_recommend balances media type on "either" rooms. Verified against
--    the live catalog: room C6995 returned Breaking Bad, Frieren, The Chosen,
--    House and Hunter x Hunter, five for five TV, on a feature called Movie
--    Night. Balasaur Score times 0.6 dominates a zero-answer score and TV
--    holds 15 of the top 20 by that formula. Movies now lead and TV takes the
--    remainder; over-cap titles are demoted rather than dropped, so a room
--    whose services only carry one type still fills.
--
-- 2. Popularity leaves the score and becomes a tiebreak only. It is invisible
--    on the card, so a 5-point nudge put an 89 above a 92 and the ranking read
--    as broken. The same room now returns 94, 92, 92, 90, 90: monotonic in the
--    only number a person can see.
--
-- 3. night_roll clears winner_media_id and winner_name. They survived a
--    re-roll, so the room kept pointing at a title no longer on screen.

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
    reveal_at = now() + make_interval(secs => v_delay),
    -- A new roll retires the old winner. Without this the room still points at
    -- a title that is no longer on screen, and the banner silently vanishes.
    winner_media_id = null, winner_name = null
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
  -- How many of one media type an "either" room may take. Balasaur Score
  -- alone puts TV in 15 of the top 20, so an unbalanced "either" roll comes
  -- back all series on a feature called Movie Night.
  v_type_cap integer;
begin
  select * into v_room from night_rooms where id = p_room_id;
  if not found then
    return jsonb_build_object('items', '[]'::jsonb, 'meta', jsonb_build_object('error', 'room not found'));
  end if;

  -- Movies lead on an "either" roll; TV takes the remainder. Titles past the
  -- cap are demoted, never dropped, so a room whose services only carry one
  -- type still fills.
  v_type_cap := greatest(p_limit - ceil(p_limit * 0.6)::int, 1);

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
      from (
        select rr.*,
          row_number() over (
            partition by rr.media_type order by rr.score desc, rr.rating_balasaur desc
          ) as type_rank
        from ranked rr
      ) r
      order by
        case
          when v_room.media_type = 'either'
           and r.media_type = 'tv'
           and r.type_rank + (
                 select count(*) from jsonb_array_elements(v_items) e
                 where e->>'media_type' = 'tv'
               ) > v_type_cap
          then 1 else 0
        end,
        r.score desc, r.rating_balasaur desc, r.popularity desc nulls last
      limit p_limit - jsonb_array_length(v_items)
    ) top;
  end loop;

  return jsonb_build_object(
    'items', v_items,
    'meta', jsonb_build_object('algo_version', 2.3, 'passes_used', v_passes_used)
  );
end;
$$;

revoke all on function public.night_recommend(uuid, integer) from public, anon, authenticated;
