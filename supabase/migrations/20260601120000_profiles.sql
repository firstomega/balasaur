-- Public profiles: the user-facing identity layer, kept deliberately separate from
-- the private /account settings. One row per auth user. Public-by-default and
-- owner-editable. Watch data still lives in user_media_status — the profile only
-- surfaces it; it does not duplicate it.

create extension if not exists citext;

create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  username        citext not null unique,          -- case-insensitive handle (the @name)
  display_name    text not null default '',
  bio             text not null default '',
  avatar_preset   text,                            -- color/preset key; real photo uploads come later
  is_public       boolean not null default true,
  favorite_genres text[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.profiles is
  'Public-facing user identity (the @handle page). Private account settings live in auth.users + the app /account page.';

alter table public.profiles enable row level security;

-- Read: visible to everyone when public; the owner can always read their own row.
drop policy if exists "profiles_select_public_or_own" on public.profiles;
create policy "profiles_select_public_or_own" on public.profiles
  for select using (is_public or auth.uid() = id);

-- Write: only ever your own row.
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles
  for delete using (auth.uid() = id);

-- Backfill: give every existing user a profile with a unique starter handle they
-- can change later. New users get theirs lazily on first load (server-side).
insert into public.profiles (id, username, display_name)
select
  u.id,
  'user_' || substr(replace(u.id::text, '-', ''), 1, 12),
  coalesce(u.raw_user_meta_data ->> 'name', split_part(coalesce(u.email, ''), '@', 1), '')
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict do nothing;
