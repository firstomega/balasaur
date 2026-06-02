-- Per-country streaming availability. The existing `streaming` column only tracked
-- US flatrate providers; this adds region-aware tokens so a viewer in (say) the UK
-- filters on what's actually streamable where they are. Tokens are "Provider:REGION"
-- (e.g. 'Netflix:GB', 'Max:US') derived from every region's flatrate block in the
-- stored TMDB watch/providers payload by the app.
--
-- Plain text[] column with a constant default '{}' → metadata-only add (NO table
-- rewrite), GIN-indexed for overlap filtering. Populated by the enrichment pipeline
-- + the backfill (no external calls); empty until a backfill pass runs.

alter table public.media add column if not exists streaming_regions text[] not null default '{}';

create index if not exists idx_media_streaming_regions on public.media using gin (streaming_regions);
