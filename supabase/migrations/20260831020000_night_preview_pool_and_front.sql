-- The wizard's needle. Any room member may ask: how many titles are in play
-- for this room right now, and what is the front of the deck?
--
-- IN PLAY is the recommender's own first-pass pool: the hard constraints that
-- can EXCLUDE a title (type, services, watched, prior rolls, quality floor
-- score >= 60 with 200+ votes, or wanted by a member). Genre and mood answers
-- re-rank, they never exclude, so the count deliberately does not move on
-- them; the front card does. If night_recommend's hard predicate changes,
-- change this WHERE in the same commit or the meter lies.
--
-- Applied to the live project 2026-08-31; this file is the record.
create or replace function public.night_preview(p_member_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_room record;
  v_pool integer;
  v_front jsonb;
begin
  select r.* into v_room from night_rooms r
    join night_members m on m.room_id = r.id and m.member_token = p_member_token
    where r.expires_at > now();
  if not found then return jsonb_build_object('error', 'not_member'); end if;

  with m as (
    select watched_ids, want_ids from night_members where room_id = v_room.id
  ),
  watched as (select distinct w from m, unnest(watched_ids) w),
  wants as (select distinct w as mid from m, unnest(want_ids) w),
  prior as (
    select distinct unnest(media_ids) as mid from night_rolls where room_id = v_room.id
  )
  select count(*)::int into v_pool
  from media md
  where md.sensitive is not true
    and md.suggestive is not true
    and md.poster_url is not null
    and md.rating_balasaur is not null
    and (
      exists (select 1 from wants w where w.mid = md.media_id)
      or (md.rating_balasaur >= 60 and coalesce(md.vote_count, 0) >= 200)
    )
    and (v_room.media_type = 'either' or md.media_type = v_room.media_type)
    and (cardinality(v_room.services) = 0 or md.streaming && v_room.services)
    and not exists (select 1 from watched ww where ww.w = md.media_id)
    and not exists (select 1 from prior pp where pp.mid = md.media_id);

  select value into v_front
  from jsonb_array_elements(night_recommend(v_room.id, 1)->'items')
  limit 1;

  return jsonb_build_object(
    'pool', v_pool,
    'front', case when v_front is null then null else jsonb_build_object(
      'media_id', v_front->>'media_id',
      'title',    v_front->>'title',
      'score',    v_front->'score'
    ) end
  );
end;
$$;

revoke all on function public.night_preview(uuid) from public;
grant execute on function public.night_preview(uuid) to anon, authenticated, service_role;
