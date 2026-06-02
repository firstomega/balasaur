-- Specific-award accolades: which of the big-four awards a title won / was nominated
-- for, parsed from the OMDb "Awards" free text by the app. Plain text[] columns with
-- a constant default → metadata-only add (NO table rewrite), GIN-indexed for overlap
-- filtering. Populated by the enrichment pipeline + the backfill (no external calls);
-- empty until a backfill pass runs.
--
-- Keys used: 'oscar', 'globe', 'bafta', 'emmy'. `awards_nominated` is a superset of
-- `awards_won` (a winner was, by definition, nominated).

alter table public.media add column if not exists awards_won text[] not null default '{}';
alter table public.media add column if not exists awards_nominated text[] not null default '{}';

create index if not exists idx_media_awards_won on public.media using gin (awards_won);
create index if not exists idx_media_awards_nominated on public.media using gin (awards_nominated);
