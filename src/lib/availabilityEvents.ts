// Streaming arrivals and departures, recorded as they are observed.
//
// media.streaming_regions only ever holds the latest state ("Netflix:GB"
// tokens), so once a title is refreshed, what it used to be on is gone. This
// module keeps the difference: each time the nightly sync re-fetches a title
// and its providers changed, one row per (region, provider) that appeared or
// disappeared goes into availability_events. History that is not recorded on
// the night it happens cannot be rebuilt later, which is why this exists
// before anything reads it.
//
// Three things a consumer must know before counting these rows:
//
// 1. Only a subset of titles is refreshed each night (about 11,700 a day as of
//    2026-10, so a given title is re-read roughly every nine days). A title
//    that was not refreshed has not "left" anything. Events are written only
//    for titles that were actually re-fetched, never inferred from absence.
//    An event therefore means "changed at some point between
//    previous_fetched_at and observed_at", not "changed on observed_on".
//
// 2. Provider data flickers. TMDB's watch/providers feed (sourced from
//    JustWatch) sometimes drops a service for one fetch and restores it on the
//    next. Count an event only once a LATER refresh agrees with it:
//
//      select e.*
//      from availability_events e
//      join media m on m.media_id = e.media_id
//      where m.fetched_at > e.observed_at            -- re-fetched since
//        and ((e.event = 'arrived'
//              and (e.provider || ':' || e.region) = any (m.streaming_regions))
//          or (e.event = 'left'
//              and not (e.provider || ':' || e.region) = any (m.streaming_regions)))
//        and not exists (                            -- and not reversed since
//          select 1 from availability_events x
//          where x.media_id = e.media_id and x.region = e.region
//            and x.provider = e.provider and x.observed_at > e.observed_at)
//        and not exists (                            -- and not undoing a flicker
//          select 1 from availability_events p
//          where p.media_id = e.media_id and p.region = e.region
//            and p.provider = e.provider and p.event <> e.event
//            and p.observed_at >= e.previous_fetched_at
//            and p.observed_at < e.observed_at);
//
//    A flicker shows up as a 'left' at one refresh and an 'arrived' at the
//    very next one. The "not reversed since" clause drops the 'left'. The last
//    clause drops the 'arrived': it undoes a change recorded at the refresh
//    just before it (that refresh stamped the fetched_at this event saved as
//    previous_fetched_at, then recorded its events after it). Without that
//    clause the restored service counts as a new arrival. A service that
//    leaves, stays gone through a later refresh, and then comes back is a
//    real return and is kept. (Checked 2026-10-15 against hand-built rows.)
//
// 3. A change to the provider name mapping in media.server.ts (a service
//    renamed or newly recognised) shows up as departures and arrivals on the
//    next refresh of every affected title. Discount events on the day such a
//    deploy lands.
//
// Everything here is fail-soft. The table may not exist yet (the migration is
// applied by hand), and a history write failing must never fail the catalog
// write it follows or turn the nightly sync red. Every exported async function
// resolves; none throws.

export type AvailabilityEventKind = "arrived" | "left";

export interface AvailabilityChange {
  provider: string;
  region: string;
  event: AvailabilityEventKind;
}

export interface AvailabilityEventRow {
  media_id: string;
  region: string;
  provider: string;
  event: AvailabilityEventKind;
  observed_on: string;
  observed_at: string;
  previous_fetched_at: string | null;
}

/** What a title looked like before this refresh overwrote it. */
export interface PriorAvailability {
  regions: string[];
  fetchedAt: string | null;
}

/** The fields of a freshly built media row this module reads. */
export interface RefreshedAvailability {
  media_id: string;
  streaming_regions?: string[] | null;
  raw_tmdb?: unknown;
}

/** "Netflix:GB" -> { provider: "Netflix", region: "GB" }. Null when malformed. */
export function parseRegionToken(token: string): { provider: string; region: string } | null {
  const at = token.lastIndexOf(":");
  if (at <= 0 || at === token.length - 1) return null;
  return { provider: token.slice(0, at), region: token.slice(at + 1) };
}

/**
 * Old "Provider:REGION" tokens vs new ones -> what arrived and what left.
 * Order-insensitive and duplicate-insensitive; output is sorted so the same
 * pair of inputs always yields the same rows.
 */
export function diffStreamingRegions(
  previous: readonly string[],
  next: readonly string[],
): AvailabilityChange[] {
  const before = new Set(previous);
  const after = new Set(next);
  const changes: AvailabilityChange[] = [];
  for (const token of after) {
    if (before.has(token)) continue;
    const parsed = parseRegionToken(token);
    if (parsed) changes.push({ ...parsed, event: "arrived" });
  }
  for (const token of before) {
    if (after.has(token)) continue;
    const parsed = parseRegionToken(token);
    if (parsed) changes.push({ ...parsed, event: "left" });
  }
  return changes.sort(
    (a, b) =>
      a.region.localeCompare(b.region) ||
      a.provider.localeCompare(b.provider) ||
      a.event.localeCompare(b.event),
  );
}

/** True when the fetched TMDB payload carried a watch/providers block at all. */
function payloadHasProviders(rawTmdb: unknown): boolean {
  return (
    typeof rawTmdb === "object" &&
    rawTmdb !== null &&
    typeof (rawTmdb as Record<string, unknown>)["watch/providers"] === "object" &&
    (rawTmdb as Record<string, unknown>)["watch/providers"] !== null
  );
}

/**
 * Event rows for one batch of refreshed titles.
 *
 * A title with no prior snapshot is skipped: it is new to the catalog (or had
 * no stored payload to derive from), so every service it is on would read as
 * an arrival when it is only our first look. A refresh whose payload lacks a
 * watch/providers block is skipped too: that is missing data, not a title
 * leaving every service.
 */
export function buildAvailabilityEventRows(
  prior: ReadonlyMap<string, PriorAvailability>,
  refreshed: readonly RefreshedAvailability[],
  now: Date,
): AvailabilityEventRow[] {
  const observedAt = now.toISOString();
  const observedOn = observedAt.slice(0, 10);
  const rows: AvailabilityEventRow[] = [];
  const seen = new Set<string>();
  for (const r of refreshed) {
    if (seen.has(r.media_id)) continue;
    seen.add(r.media_id);
    const before = prior.get(r.media_id);
    if (!before) continue;
    if (!payloadHasProviders(r.raw_tmdb)) continue;
    for (const change of diffStreamingRegions(before.regions, r.streaming_regions ?? [])) {
      rows.push({
        media_id: r.media_id,
        region: change.region,
        provider: change.provider,
        event: change.event,
        observed_on: observedOn,
        observed_at: observedAt,
        previous_fetched_at: before.fetchedAt,
      });
    }
  }
  return rows;
}

// A deliberately narrow view of the Supabase client: only the calls made
// here, so tests can hand in a fake.
interface QueryResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}
interface SnapshotQuery {
  in(column: string, values: string[]): SnapshotQuery;
  not(column: string, operator: string, value: unknown): PromiseLike<QueryResult<SnapshotRow>>;
}
interface SnapshotRow {
  media_id: string;
  streaming_regions: string[] | null;
  fetched_at: string | null;
}
export interface AvailabilityClient {
  from(table: string): {
    select(columns: string): SnapshotQuery;
    upsert(
      rows: AvailabilityEventRow[],
      opts: { onConflict: string; ignoreDuplicates: boolean },
    ): PromiseLike<{ error: { message: string } | null }>;
  };
}

const ID_CHUNK = 200;
const INSERT_CHUNK = 500;

/**
 * Read the stored availability for titles about to be overwritten. Call this
 * BEFORE the media upsert. Rows without a stored raw_tmdb are left out, since
 * their streaming_regions were never derived from a real payload and diffing
 * against them would invent arrivals.
 *
 * Returns null when the read fails; recordAvailabilityEvents then writes
 * nothing for this batch.
 */
export async function snapshotAvailability(
  client: AvailabilityClient,
  mediaIds: readonly string[],
  log: Pick<Console, "warn"> = console,
): Promise<Map<string, PriorAvailability> | null> {
  try {
    const ids = Array.from(new Set(mediaIds));
    const prior = new Map<string, PriorAvailability>();
    for (let i = 0; i < ids.length; i += ID_CHUNK) {
      const slice = ids.slice(i, i + ID_CHUNK);
      const { data, error } = await client
        .from("media")
        .select("media_id, streaming_regions, fetched_at")
        .in("media_id", slice)
        .not("raw_tmdb", "is", null);
      if (error) {
        log.warn(`[availability] snapshot read failed, skipping history: ${error.message}`);
        return null;
      }
      for (const row of data ?? []) {
        prior.set(row.media_id, {
          regions: row.streaming_regions ?? [],
          fetchedAt: row.fetched_at ?? null,
        });
      }
    }
    return prior;
  } catch (e) {
    log.warn(`[availability] snapshot read threw, skipping history: ${String(e)}`);
    return null;
  }
}

export interface RecordResult {
  written: number;
  /** Set when nothing (or not everything) was written, with the reason. */
  skipped: string | null;
}

/**
 * Write the arrivals and departures for a batch that has just been upserted.
 * Call this only AFTER the media write succeeded, so a failed catalog write
 * leaves no history behind for a change that did not land.
 *
 * Idempotent per day: the unique key (media_id, region, provider, event,
 * observed_on) plus ignoreDuplicates means a retried pass does not
 * double-write.
 */
export async function recordAvailabilityEvents(
  client: AvailabilityClient,
  prior: ReadonlyMap<string, PriorAvailability> | null,
  refreshed: readonly RefreshedAvailability[],
  opts: { now?: Date; tag?: string; log?: Pick<Console, "log" | "warn"> } = {},
): Promise<RecordResult> {
  const log = opts.log ?? console;
  const tag = opts.tag ?? "sync";
  try {
    if (!prior) return { written: 0, skipped: "no snapshot" };
    const rows = buildAvailabilityEventRows(prior, refreshed, opts.now ?? new Date());
    if (rows.length === 0) return { written: 0, skipped: null };
    let written = 0;
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const chunk = rows.slice(i, i + INSERT_CHUNK);
      const { error } = await client.from("availability_events").upsert(chunk, {
        onConflict: "media_id,region,provider,event,observed_on",
        ignoreDuplicates: true,
      });
      if (error) {
        // Most likely the table is not created yet. Stop here: the next chunk
        // would fail the same way, and the catalog write already landed.
        log.warn(
          `[${tag}] availability history not written (${rows.length - written} rows dropped): ${error.message}`,
        );
        return { written, skipped: error.message };
      }
      written += chunk.length;
    }
    log.log(`[${tag}] recorded ${written} streaming arrivals/departures`);
    return { written, skipped: null };
  } catch (e) {
    log.warn(`[${tag}] availability history threw, ignored: ${String(e)}`);
    return { written: 0, skipped: String(e) };
  }
}
