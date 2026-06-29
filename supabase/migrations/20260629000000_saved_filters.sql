-- Saved filters: a signed-in user can save named filter "views" and re-apply them.
-- filter_state holds the serialized FilterState (same shape as the sessionStorage blob).
-- RLS-scoped so each user only ever sees/edits their own rows.
-- NOTE: Lovable Cloud owns the DB and does not auto-apply repo migrations — this was
-- applied live via the Lovable SQL editor; this file keeps the repo schema in sync.

create table if not exists public.saved_filters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  filter_state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.saved_filters enable row level security;

do $$ begin
  create policy "saved_filters_select_own" on public.saved_filters
    for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "saved_filters_insert_own" on public.saved_filters
    for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "saved_filters_update_own" on public.saved_filters
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "saved_filters_delete_own" on public.saved_filters
    for delete using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

create index if not exists idx_saved_filters_user
  on public.saved_filters (user_id, created_at desc);
