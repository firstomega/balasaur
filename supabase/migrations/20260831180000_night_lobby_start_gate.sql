-- The lobby. A group room now has a phase before the questions: everyone
-- gathers, and nobody answers alone while the others are still arriving.
--
-- Applied to the live project 2026-08-31; this file is the record.
alter table public.night_rooms add column if not exists started_at timestamptz;

do $patch$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'night_state';
  if v_def is null then raise exception 'night_state not found'; end if;
  if position('''started_at'', v_room.started_at' in v_def) = 0 then
    v_def := replace(
      v_def,
      '''expires_at'', v_room.expires_at',
      '''expires_at'', v_room.expires_at, ''started_at'', v_room.started_at'
    );
    execute v_def;
  end if;
end
$patch$;

-- Who may start, and the proof a room can never deadlock:
--   the host, whenever they like;
--   any member once everyone is ready and there are at least two of them;
--   any member once the room is three minutes old.
create or replace function public.night_start(p_member_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_room record;
  v_me record;
  v_total integer;
  v_ready integer;
begin
  select r.* into v_room from night_rooms r
    join night_members m on m.room_id = r.id and m.member_token = p_member_token
    where r.expires_at > now()
    for update of r;
  if not found then return jsonb_build_object('error', 'not_member'); end if;
  if v_room.started_at is not null then
    return jsonb_build_object('ok', true, 'started_at', v_room.started_at);
  end if;

  select * into v_me from night_members
    where room_id = v_room.id and member_token = p_member_token;
  select count(*), count(*) filter (where ready) into v_total, v_ready
    from night_members where room_id = v_room.id;

  if not (
    v_me.member_token = v_room.host_token
    or (v_total >= 2 and v_ready = v_total)
    or now() - v_room.created_at > interval '3 minutes'
  ) then
    return jsonb_build_object('error', 'not_yet');
  end if;

  update night_rooms set started_at = now() where id = v_room.id
    returning started_at into v_room.started_at;
  update night_members set ready = false where room_id = v_room.id;

  return jsonb_build_object('ok', true, 'started_at', v_room.started_at);
end;
$$;

revoke all on function public.night_start(uuid) from public;
grant execute on function public.night_start(uuid) to anon, authenticated, service_role;

update public.night_rooms set started_at = created_at
  where mode = 'solo' and started_at is null;

-- The lobby's "anyone can start after three minutes" affordance needs the
-- room's age. Deriving it from expires_at minus a hardcoded 24 hours works
-- only until someone changes the TTL, and then the button drifts silently.
do $patch2$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'night_state';
  if v_def is null then raise exception 'night_state not found'; end if;
  if position('''created_at'', v_room.created_at' in v_def) = 0 then
    v_def := replace(
      v_def,
      '''expires_at'', v_room.expires_at',
      '''expires_at'', v_room.expires_at, ''created_at'', v_room.created_at'
    );
    execute v_def;
  end if;
end
$patch2$;
