-- Applied to the live project first (version 20260908141658), mirrored here per
-- the house rule.
--
-- Two colors per title, read out of the poster during the nightly sync, so the
-- ambient glow and the card placeholder tint paint on the server's first render
-- instead of after the image loads. Extraction is src/lib/posterColor.ts: it
-- pulls the DC coefficient of every 8x8 block out of the w92 JPEG (that
-- coefficient IS the block's average color), bins the result by hue, and keeps
-- the two strongest bins.
--
-- color_at is the "we looked" stamp, not "we found": a poster that decodes to
-- nothing usable still gets stamped, so the backfill never re-reads it forever.
-- A fetch that fails leaves it null and is retried. To re-read the whole
-- catalog after a poster refresh, set color_at back to null.

alter table public.media
  add column if not exists color_a text,
  add column if not exists color_b text,
  add column if not exists color_at timestamptz;

-- These values are interpolated into a CSS gradient. Constrain them to a
-- lowercase 6-digit hex at the source so nothing else can arrive there.
alter table public.media
  drop constraint if exists media_color_a_hex;
alter table public.media
  add constraint media_color_a_hex
  check (color_a is null or color_a ~ '^#[0-9a-f]{6}$');

alter table public.media
  drop constraint if exists media_color_b_hex;
alter table public.media
  add constraint media_color_b_hex
  check (color_b is null or color_b ~ '^#[0-9a-f]{6}$');

-- The backfill claims work "most popular first, never looked at yet". Without
-- this it is a full scan of 84k rows on every call.
create index if not exists media_color_backfill_idx
  on public.media (popularity desc nulls last)
  where color_at is null and poster_url is not null;

comment on column public.media.color_a is 'Dominant poster color as #rrggbb, extracted server-side from the w92 poster.';
comment on column public.media.color_b is 'Secondary poster color as #rrggbb, the strongest hue at least 45 degrees from color_a.';
comment on column public.media.color_at is 'When the poster was last read for color. Set even when no color was found.';
