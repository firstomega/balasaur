-- Applied to the live project first (version 20261105223154) with the Supabase
-- MCP apply_migration tool, mirrored here per the house rule.
--
-- One of fourteen flat tile colours per title, for the Colour Shelf design.
-- The table of swatches, and the method that picks one, live in
-- src/lib/posterSwatch.ts: the w92 poster's 8x8 block averages are binned by
-- hue with saturation-squared votes and the winning colour is snapped to a
-- swatch, or to noir when the poster has no real colour.
--
-- WHY NOT color_a. color_a is a colour pulled into a dimmed range for a 22%
-- glow on a dark page. Snapping it to a swatch was tried side by side with a
-- fresh read of the poster and was wrong most of the time: The Crown and
-- Alien came out orange, The Sopranos sky. So the poster is read again.
--
-- swatch_alt is the poster's second colour when it snaps to a different
-- swatch. A list tile uses it when the tile beside it would otherwise share
-- its colour.
--
-- swatch_at is the "we looked" stamp, as color_at is: a poster that cannot be
-- read is stamped with a null swatch so the queue never re-reads it. To
-- re-read everything, set swatch_at back to null.
--
-- Additive only. The constraints are added only when missing, so the file
-- can be re-run.

alter table public.media
  add column if not exists swatch text,
  add column if not exists swatch_alt text,
  add column if not exists swatch_at timestamptz;

do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'media_swatch_key') then
    alter table public.media
      add constraint media_swatch_key check (
        swatch is null or swatch in (
          'red', 'orange', 'gold', 'lime', 'green', 'teal', 'sky', 'blue',
          'violet', 'pink', 'wine', 'rust', 'navy', 'noir'
        )
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'media_swatch_alt_key') then
    alter table public.media
      add constraint media_swatch_alt_key check (
        swatch_alt is null or swatch_alt in (
          'red', 'orange', 'gold', 'lime', 'green', 'teal', 'sky', 'blue',
          'violet', 'pink', 'wine', 'rust', 'navy', 'noir'
        )
      );
  end if;
end
$mig$;

-- The nightly queue claims "never looked at, most popular first".
create index if not exists media_swatch_queue_idx
  on public.media (popularity desc nulls last)
  where swatch_at is null and poster_url is not null;

comment on column public.media.swatch is 'Tile colour key, one of the 14 in src/lib/posterSwatch.ts, read from the w92 poster. Null when the poster could not be read.';
comment on column public.media.swatch_alt is 'Second tile colour key from the same poster, when it differs from swatch.';
comment on column public.media.swatch_at is 'When the poster was last read for its swatch. Set even when it could not be read.';
