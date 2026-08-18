-- Applied to the live project 2026-08-18. This file is the record, not the
-- source of truth (Lovable Cloud does not auto-apply repo migrations).
--
-- Pins each day's Balasaurdle answer. Without this the pick was an offset
-- into a live-counted pool, so the nightly sync changing pool membership
-- could swap the answer mid-day: two players sharing "Balasaurdle #N" would
-- have played different titles. First request of a day computes the pick and
-- inserts; every later request reads the pinned row. ON CONFLICT on the
-- primary key makes the race between two first-requests harmless.
create table if not exists public.daily_challenges (
  day int primary key,
  media_id text not null references public.media(media_id),
  created_at timestamptz not null default now()
);
alter table public.daily_challenges enable row level security;
revoke all on public.daily_challenges from anon, authenticated;
grant select, insert on public.daily_challenges to service_role;
