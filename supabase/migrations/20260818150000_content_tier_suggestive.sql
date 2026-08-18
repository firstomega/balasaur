-- Content tier: `suggestive` marks the fan-service tier (a superset of
-- `sensitive`). Suggestive titles stay browsable and searchable but are
-- excluded from every surface where the site itself recommends: related
-- rails, collections, the rate deck. `tmdb_collection_id` (TMDB franchise
-- membership, movies only) feeds the rebuilt similarity engine.
--
-- Record of changes applied to the live project on 2026-08-18 (this file is
-- the record, not the source of truth). The one-off data backfills that ran
-- alongside the DDL are included below so the record is complete.

alter table public.media add column if not exists suggestive boolean not null default false;
alter table public.media add column if not exists tmdb_collection_id bigint;
create index if not exists idx_media_collection on public.media (tmdb_collection_id) where tmdb_collection_id is not null;

-- Backfill 1 (data, ran live in three passes: sensitive, movie, tv):
-- suggestive = sensitive OR a fan-service keyword hit. Mirrors
-- deriveSuggestive() in src/lib/contentSafety.ts, which maintains the flag
-- nightly from here on. Result at apply time: 777 rows (715 sensitive + 62
-- keyword-only).
update public.media set suggestive = true where sensitive and not suggestive;

with kw as (
  select media_id,
    (select array_agg(lower(k->>'name'))
     from jsonb_array_elements(coalesce(raw_tmdb->'keywords'->'keywords', raw_tmdb->'keywords'->'results', '[]'::jsonb)) k) as names
  from public.media where raw_tmdb is not null and not suggestive
),
hits as (
  select media_id from kw where names is not null and exists (
    select 1 from unnest(names) n
    where n like '%ecchi%' or n like '%harem%' or n like '%fan service%' or n like '%fanservice%'
       or n like '%sexual fantasy%' or n like '%gravure%' or n like '%seduction comedy%')
)
update public.media m set suggestive = true where m.media_id in (select media_id from hits);

-- Backfill 2 (data): TMDB franchise id for movies, from the stored raw payload.
-- 4,231 rows at apply time. Maintained by rowFromEnrichedItem/backfillFromRaw.
update public.media
set tmdb_collection_id = nullif(raw_tmdb->'belongs_to_collection'->>'id','')::bigint
where media_type = 'movie' and raw_tmdb is not null
  and jsonb_typeof(raw_tmdb->'belongs_to_collection') = 'object'
  and tmdb_collection_id is null;

-- Backfill 3 (data): audience re-derivation mirroring the new deriveAudience():
-- cert-mapped value only; the Animation family-lean now requires the Family
-- genre and fires only when certification gave no answer; suggestive strips
-- Kids/Family. Uncertified adult anime was landing in audience=Family through
-- the old blanket Animation lean (the Sesame Street recommendation failure).
-- Cohort limited to rows the rule change can affect. Animation-with-Family-
-- audience went 7,839 -> 2,923 rows at apply time.
with target as (
  select media_id, media_type, genres, audience, suggestive, raw_tmdb
  from public.media
  where raw_tmdb is not null
    and ('Animation' = any(genres) or (suggestive and audience && array['Kids','Family']))
),
cert as (
  select media_id, media_type, genres, audience, suggestive,
    case when media_type = 'movie' then
      (select nullif(upper(trim(rd.val->>'certification')),'')
       from (select r.val from jsonb_array_elements(coalesce(raw_tmdb->'release_dates'->'results','[]'::jsonb)) with ordinality r(val,i)
             where r.val->>'iso_3166_1' = 'US' order by i limit 1) us,
            jsonb_array_elements(coalesce(us.val->'release_dates','[]'::jsonb)) with ordinality rd(val,j)
       where coalesce(trim(rd.val->>'certification'),'') <> ''
       order by j limit 1)
    else
      (select nullif(upper(trim(r.val->>'rating')),'')
       from jsonb_array_elements(coalesce(raw_tmdb->'content_ratings'->'results','[]'::jsonb)) with ordinality r(val,i)
       where r.val->>'iso_3166_1' = 'US' order by i limit 1)
    end as cert
  from target
),
mapped as (
  select *,
    case when media_type = 'tv' then
      case cert when 'TV-Y' then 'Kids' when 'TV-Y7' then 'Kids' when 'TV-G' then 'Family'
                when 'TV-PG' then 'Family' when 'TV-14' then 'Teen' when 'TV-MA' then 'Mature' end
    else
      case cert when 'G' then 'Family' when 'PG' then 'Family' when 'PG-13' then 'Teen'
                when 'R' then 'Adult' when 'NC-17' then 'Mature' end
    end as band
  from cert
),
computed as (
  select media_id,
    case
      when band is not null then
        case when suggestive and band in ('Kids','Family') then '{}'::text[] else array[band] end
      when 'Animation' = any(genres) and 'Family' = any(genres) and not suggestive then array['Family']
      else '{}'::text[]
    end as new_audience,
    audience as old_audience
  from mapped
)
update public.media m
set audience = c.new_audience, updated_at = now()
from computed c
where m.media_id = c.media_id and c.new_audience is distinct from c.old_audience;

-- Backfill 4 (data): rows whose raw payload is still missing (July data loss,
-- healing nightly) cannot be re-derived, but the old lean's Family/Kids tag on
-- a non-Family-genre Animation title is exactly the unsafe case. Strip it; the
-- backfill restores cert-based values once raw returns.
update public.media
set audience = array_remove(array_remove(audience, 'Family'), 'Kids'), updated_at = now()
where raw_tmdb is null and 'Animation' = any(genres) and not ('Family' = any(genres))
  and audience && array['Family','Kids'];
