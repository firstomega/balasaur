import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  buildAvailabilityEventRows,
  diffStreamingRegions,
  parseRegionToken,
  recordAvailabilityEvents,
  snapshotAvailability,
  type AvailabilityClient,
  type AvailabilityEventRow,
  type PriorAvailability,
} from "./availabilityEvents";

const NOW = new Date("2026-10-15T03:12:00.000Z");
const PROVIDERS = { "watch/providers": { results: {} } };
const quiet = { log: () => {}, warn: () => {} };

describe("parseRegionToken", () => {
  it("splits on the last colon", () => {
    expect(parseRegionToken("Netflix:GB")).toEqual({ provider: "Netflix", region: "GB" });
    expect(parseRegionToken("Odd:Name:US")).toEqual({ provider: "Odd:Name", region: "US" });
  });

  it("rejects malformed tokens", () => {
    expect(parseRegionToken("Netflix")).toBeNull();
    expect(parseRegionToken(":GB")).toBeNull();
    expect(parseRegionToken("Netflix:")).toBeNull();
  });
});

describe("diffStreamingRegions", () => {
  it("reports what appeared and what disappeared", () => {
    expect(
      diffStreamingRegions(["Netflix:US", "Netflix:GB", "Hulu:US"], ["Netflix:US", "Max:US"]),
    ).toEqual([
      { provider: "Netflix", region: "GB", event: "left" },
      { provider: "Hulu", region: "US", event: "left" },
      { provider: "Max", region: "US", event: "arrived" },
    ]);
  });

  it("ignores order and duplicates", () => {
    expect(diffStreamingRegions(["A:US", "B:US"], ["B:US", "A:US", "A:US"])).toEqual([]);
  });

  it("treats every token as an arrival from empty and a departure to empty", () => {
    expect(diffStreamingRegions([], ["Netflix:US"])).toEqual([
      { provider: "Netflix", region: "US", event: "arrived" },
    ]);
    expect(diffStreamingRegions(["Netflix:US"], [])).toEqual([
      { provider: "Netflix", region: "US", event: "left" },
    ]);
  });
});

describe("buildAvailabilityEventRows", () => {
  const prior = new Map<string, PriorAvailability>([
    ["movie-1", { regions: ["Netflix:US", "Netflix:GB"], fetchedAt: "2026-10-06T02:00:00Z" }],
    ["movie-2", { regions: ["Hulu:US"], fetchedAt: "2026-10-05T02:00:00Z" }],
  ]);

  it("writes one row per change, stamped with the day and the previous fetch", () => {
    const rows = buildAvailabilityEventRows(
      prior,
      [{ media_id: "movie-1", streaming_regions: ["Netflix:US", "Max:US"], raw_tmdb: PROVIDERS }],
      NOW,
    );
    expect(rows).toEqual([
      {
        media_id: "movie-1",
        region: "GB",
        provider: "Netflix",
        event: "left",
        observed_on: "2026-10-15",
        observed_at: "2026-10-15T03:12:00.000Z",
        previous_fetched_at: "2026-10-06T02:00:00Z",
      },
      {
        media_id: "movie-1",
        region: "US",
        provider: "Max",
        event: "arrived",
        observed_on: "2026-10-15",
        observed_at: "2026-10-15T03:12:00.000Z",
        previous_fetched_at: "2026-10-06T02:00:00Z",
      },
    ]);
  });

  it("writes nothing for a refreshed title whose availability did not change", () => {
    const rows = buildAvailabilityEventRows(
      prior,
      [{ media_id: "movie-2", streaming_regions: ["Hulu:US"], raw_tmdb: PROVIDERS }],
      NOW,
    );
    expect(rows).toEqual([]);
  });

  it("does not call a first look an arrival", () => {
    // A title new to the catalog has no snapshot. Its services were not
    // gained tonight; we simply never looked before.
    const rows = buildAvailabilityEventRows(
      prior,
      [{ media_id: "movie-9", streaming_regions: ["Netflix:US"], raw_tmdb: PROVIDERS }],
      NOW,
    );
    expect(rows).toEqual([]);
  });

  it("does not call missing provider data a departure", () => {
    const rows = buildAvailabilityEventRows(
      prior,
      [{ media_id: "movie-1", streaming_regions: [], raw_tmdb: { title: "no providers block" } }],
      NOW,
    );
    expect(rows).toEqual([]);
  });

  it("does record a real departure from every service", () => {
    const rows = buildAvailabilityEventRows(
      prior,
      [{ media_id: "movie-2", streaming_regions: [], raw_tmdb: PROVIDERS }],
      NOW,
    );
    expect(rows.map((r) => `${r.event} ${r.provider}:${r.region}`)).toEqual(["left Hulu:US"]);
  });

  it("only diffs titles in the refreshed batch, so an unrefreshed title never 'leaves'", () => {
    const rows = buildAvailabilityEventRows(prior, [], NOW);
    expect(rows).toEqual([]);
  });

  it("counts a title appearing twice in one batch once", () => {
    const r = { media_id: "movie-2", streaming_regions: [], raw_tmdb: PROVIDERS };
    expect(buildAvailabilityEventRows(prior, [r, r], NOW).length).toBe(1);
  });
});

/** A fake client that records calls and can be told to fail in each way. */
function fakeClient(opts: {
  snapshot?: { media_id: string; streaming_regions: string[] | null; fetched_at: string }[];
  snapshotError?: string;
  insertError?: string;
  throwOn?: "from" | "insert";
}) {
  const inserted: AvailabilityEventRow[][] = [];
  const filters: string[] = [];
  const client: AvailabilityClient = {
    from(table: string) {
      if (opts.throwOn === "from") throw new Error(`boom from(${table})`);
      return {
        select() {
          const q = {
            in(column: string, values: string[]) {
              filters.push(`${column} in ${values.length}`);
              return q;
            },
            not(column: string, operator: string, value: unknown) {
              filters.push(`${column} not ${operator} ${String(value)}`);
              return Promise.resolve(
                opts.snapshotError
                  ? { data: null, error: { message: opts.snapshotError } }
                  : { data: opts.snapshot ?? [], error: null },
              );
            },
          };
          return q;
        },
        upsert(rows: AvailabilityEventRow[]) {
          if (opts.throwOn === "insert") return Promise.reject(new Error("network down"));
          if (opts.insertError) return Promise.resolve({ error: { message: opts.insertError } });
          inserted.push(rows);
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { client, inserted, filters };
}

describe("snapshotAvailability", () => {
  it("reads prior regions only for rows that had a stored payload", async () => {
    const f = fakeClient({
      snapshot: [
        { media_id: "movie-1", streaming_regions: ["Netflix:US"], fetched_at: "2026-10-06" },
      ],
    });
    const prior = await snapshotAvailability(f.client, ["movie-1", "movie-1", "movie-2"], quiet);
    expect(prior?.get("movie-1")).toEqual({ regions: ["Netflix:US"], fetchedAt: "2026-10-06" });
    expect(prior?.has("movie-2")).toBe(false);
    expect(f.filters).toEqual(["media_id in 2", "raw_tmdb not is null"]);
  });

  it("returns null instead of throwing when the read fails", async () => {
    const f = fakeClient({ snapshotError: "statement timeout" });
    expect(await snapshotAvailability(f.client, ["movie-1"], quiet)).toBeNull();
  });

  it("returns null instead of throwing when the client throws", async () => {
    const f = fakeClient({ throwOn: "from" });
    expect(await snapshotAvailability(f.client, ["movie-1"], quiet)).toBeNull();
  });
});

describe("recordAvailabilityEvents is fail-soft", () => {
  const prior = new Map<string, PriorAvailability>([
    ["movie-1", { regions: ["Netflix:US"], fetchedAt: null }],
  ]);
  const refreshed = [{ media_id: "movie-1", streaming_regions: ["Max:US"], raw_tmdb: PROVIDERS }];

  it("writes the events when the table exists", async () => {
    const f = fakeClient({});
    const r = await recordAvailabilityEvents(f.client, prior, refreshed, { now: NOW, log: quiet });
    expect(r).toEqual({ written: 2, skipped: null });
    expect(f.inserted[0].map((e) => `${e.event} ${e.provider}`)).toEqual([
      "arrived Max",
      "left Netflix",
    ]);
  });

  it("resolves when the table does not exist yet", async () => {
    const f = fakeClient({
      insertError: 'relation "public.availability_events" does not exist',
    });
    const r = await recordAvailabilityEvents(f.client, prior, refreshed, { now: NOW, log: quiet });
    expect(r.written).toBe(0);
    expect(r.skipped).toContain("does not exist");
  });

  it("resolves when the insert rejects", async () => {
    const f = fakeClient({ throwOn: "insert" });
    const r = await recordAvailabilityEvents(f.client, prior, refreshed, { now: NOW, log: quiet });
    expect(r.written).toBe(0);
    expect(r.skipped).toContain("network down");
  });

  it("resolves when the client itself throws", async () => {
    const f = fakeClient({ throwOn: "from" });
    const r = await recordAvailabilityEvents(f.client, prior, refreshed, { now: NOW, log: quiet });
    expect(r.written).toBe(0);
  });

  it("writes nothing when the snapshot could not be taken", async () => {
    const f = fakeClient({});
    const r = await recordAvailabilityEvents(f.client, null, refreshed, { now: NOW, log: quiet });
    expect(r).toEqual({ written: 0, skipped: "no snapshot" });
    expect(f.inserted.length).toBe(0);
  });

  it("asks the database to ignore a repeat of the same day's observation", async () => {
    let seen: { onConflict: string; ignoreDuplicates: boolean } | null = null;
    const client: AvailabilityClient = {
      from: () => ({
        select: () => {
          throw new Error("unused");
        },
        upsert: (_rows, o) => {
          seen = o;
          return Promise.resolve({ error: null });
        },
      }),
    };
    await recordAvailabilityEvents(client, prior, refreshed, { now: NOW, log: quiet });
    expect(seen).toEqual({
      onConflict: "media_id,region,provider,event,observed_on",
      ignoreDuplicates: true,
    });
  });
});

// The wiring lives in media.server.ts, which cannot be imported here without
// live credentials. Check the one decision that matters: history is read
// before the catalog write and recorded only after the write is verified, so
// it can never be the reason the strict upsert throws.
describe("strict media upsert wiring", () => {
  const source = readFileSync(new URL("./media.server.ts", import.meta.url), "utf8");
  const start = source.indexOf("async function upsertMediaRowsStrict");
  const fn = source.slice(start, source.indexOf("\n}\n", start));

  it("snapshots before the upsert and records after the persistence check", () => {
    const snap = fn.indexOf("snapshotAvailability(");
    const upsert = fn.indexOf("upsertInChunks(");
    const verify = fn.indexOf("write did not persist");
    const record = fn.indexOf("recordAvailabilityEvents(");
    expect(start).toBeGreaterThan(-1);
    expect(snap).toBeGreaterThan(-1);
    expect(verify).toBeGreaterThan(-1);
    expect(snap).toBeLessThan(upsert);
    expect(record).toBeGreaterThan(verify);
  });

  it("does not record history from the backfill, which re-reads stored payloads", () => {
    const b = source.indexOf("export async function backfillFromRaw");
    const body = source.slice(b, source.indexOf("\nasync function upsertMediaRowsStrict", b));
    expect(body).not.toContain("recordAvailabilityEvents(");
  });
});
