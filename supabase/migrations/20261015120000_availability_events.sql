-- NOT YET APPLIED. Apply to the live project, then keep this file as the record.
--
-- Streaming arrivals and departures, one row per (title, region, provider)
-- that changed between two fetches of the same title. Written by the nightly
-- sync and the stalest-first refresh (src/lib/availabilityEvents.ts, called
-- from upsertMediaRowsStrict in src/lib/media.server.ts) only when a title is
-- actually re-fetched and its streaming_regions differ from the stored value.
-- The app tolerates this table being absent: until it exists, the write is
-- logged and skipped and the sync stays green.
--
-- Reading it:
--   * Only a subset of the catalog is refreshed each night, so a title not
--     refreshed has not left anything. An event means "changed somewhere
--     between previous_fetched_at and observed_at".
--   * Provider data flickers. Count an event only after a later refresh
--     agrees with it: media.fetched_at > observed_at, the current
--     media.streaming_regions still agrees, no later event exists for the
--     same (media_id, region, provider), and the event does not undo an
--     opposite event recorded at the refresh just before it (observed_at at or
--     after this row's previous_fetched_at). That last condition is what drops
--     the 'arrived' half of a one-refresh flicker. The full query is in the
--     header of src/lib/availabilityEvents.ts.
--   * A new title's first fetch writes nothing (no earlier state to compare).

create table if not exists public.availability_events (
  id bigint generated always as identity primary key,
  media_id text not null references public.media (media_id) on delete cascade,
  region text not null,
  provider text not null,
  event text not null check (event in ('arrived', 'left')),
  observed_on date not null,
  observed_at timestamptz not null default now(),
  previous_fetched_at timestamptz,
  constraint availability_events_once_per_day
    unique (media_id, region, provider, event, observed_on)
);

comment on table public.availability_events is 'Streaming arrivals and departures per title, region and provider, observed when the nightly sync re-fetches a title. Absence of a row is not absence of a change: most titles are not refreshed on a given night.';
comment on column public.availability_events.region is 'ISO 3166-1 region code as TMDB reports it, upper case (US, GB, ...).';
comment on column public.availability_events.provider is 'Normalized provider name, the part before the colon in a media.streaming_regions token.';
comment on column public.availability_events.observed_on is 'UTC day of the refresh that saw the change. Part of the unique key so a retried pass does not double-write.';
comment on column public.availability_events.observed_at is 'When the change was recorded, just after the media row was written. Orders two events for the same title on one day.';
comment on column public.availability_events.previous_fetched_at is 'media.fetched_at before this refresh: the change happened at some point after this.';

-- Server-only, like the rest of the catalog.
alter table public.availability_events enable row level security;
revoke all on table public.availability_events from anon, authenticated;

create index if not exists availability_events_observed_on_idx
  on public.availability_events (observed_on);
create index if not exists availability_events_region_provider_idx
  on public.availability_events (region, provider, observed_on);
