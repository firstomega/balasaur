-- My Library: hand-arranged shelves. One row per shelf per user; items is the
-- ordered media_id array, and the ORDER is the content (a stack of pairwise
-- verdicts no star rating captures). Guests keep the same shape in
-- localStorage; this table is the signed-in home for it.
--
-- Applied to the live project 2026-08-31; this file is the record.
create table if not exists public.user_shelves (
  user_id uuid not null references auth.users(id) on delete cascade,
  shelf_id text not null,
  name text not null check (char_length(name) between 1 and 40),
  position integer not null default 0,
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  updated_at timestamptz not null default now(),
  primary key (user_id, shelf_id)
);

alter table public.user_shelves enable row level security;

create policy "own shelves select" on public.user_shelves
  for select using ((select auth.uid()) = user_id);
create policy "own shelves insert" on public.user_shelves
  for insert with check ((select auth.uid()) = user_id);
create policy "own shelves update" on public.user_shelves
  for update using ((select auth.uid()) = user_id);
create policy "own shelves delete" on public.user_shelves
  for delete using ((select auth.uid()) = user_id);

revoke all on public.user_shelves from anon;
grant select, insert, update, delete on public.user_shelves to authenticated;
