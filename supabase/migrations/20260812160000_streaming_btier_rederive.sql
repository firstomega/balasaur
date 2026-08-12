-- One-shot re-derive of streaming / streaming_regions from stored raw_tmdb
-- watch-provider payloads, now that provider normalization knows the B-tier
-- services (Paramount+, Peacock, Tubi). Notes that shaped this:
--  * TMDB ships these under many channel-variant names ("Paramount Plus
--    Premium", "Paramount+ Roku Premium Channel", one with a trailing space),
--    so they normalize by trimmed PREFIX, not exact name.
--  * AVOD services (Tubi) report under the free/ads blocks, never flatrate.
-- SQL mirror of normalizeProviderName / deriveStreaming* in
-- src/lib/media.server.ts; the nightly backfill keeps rows in sync from here.

with mapped as (
  select m.media_id,
    coalesce(array_agg(distinct norm.name) filter (where norm.region = 'US'), '{}') as streaming_us,
    coalesce(array_agg(distinct (norm.name || ':' || norm.region)), '{}') as tokens
  from public.media m
  cross join lateral (
    select upper(r.key) as region,
      case
        when btrim(p ->> 'provider_name') in ('Netflix') then 'Netflix'
        when btrim(p ->> 'provider_name') in ('Max', 'HBO Max') then 'Max'
        when btrim(p ->> 'provider_name') in ('Amazon Prime Video', 'Amazon Prime Video with Ads') then 'Prime'
        when btrim(p ->> 'provider_name') in ('Apple TV+', 'Apple TV Plus', 'Apple TV') then 'Apple TV+'
        when btrim(p ->> 'provider_name') in ('Hulu') then 'Hulu'
        when btrim(p ->> 'provider_name') in ('Disney Plus', 'Disney+') then 'Disney+'
        when btrim(p ->> 'provider_name') ilike 'Paramount%' then 'Paramount+'
        when btrim(p ->> 'provider_name') ilike 'Peacock%' then 'Peacock'
        when btrim(p ->> 'provider_name') ilike 'Tubi%' then 'Tubi'
        else null
      end as name
    from jsonb_each(m.raw_tmdb #> '{watch/providers,results}') r
    cross join lateral jsonb_array_elements(
      coalesce(r.value -> 'flatrate', '[]'::jsonb)
      || coalesce(r.value -> 'free', '[]'::jsonb)
      || coalesce(r.value -> 'ads', '[]'::jsonb)
    ) p
  ) norm
  where m.raw_tmdb #> '{watch/providers,results}' is not null
    and norm.name is not null
  group by m.media_id
)
update public.media m
set streaming = mp.streaming_us,
    streaming_regions = mp.tokens
from mapped mp
where mp.media_id = m.media_id
  and (m.streaming is distinct from mp.streaming_us
    or m.streaming_regions is distinct from mp.tokens);
