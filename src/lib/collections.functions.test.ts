import { describe, expect, it } from "bun:test";
import { readCollection, readCollectionRows } from "./collections.functions";
import type { CardRow } from "./catalog.functions";
import { DataUnavailableError } from "./dataError";
import { FAILED, rejectionOf, stubSupabase } from "./supabaseStub";

// A failed read must throw so the page is an uncached error, not a 404 or an
// empty list that the CDN keeps for six hours. A read that succeeds with zero
// rows keeps its old answer.

const LIST = {
  slug: "best-horror",
  kind: "genre",
  title: "The Best Horror Movies and Shows",
  item_count: 2,
  top_score: 88,
  median_score: 74,
  newest_title: "Weapons",
  newest_date: "2025-08-08",
  updated_at: "2026-11-05T04:00:00Z",
};

function card(id: string, title: string): CardRow {
  return {
    media_id: id,
    media_type: "movie",
    title,
    year: "1980",
    poster_url: "/p.jpg",
    popularity: 40,
    release_date: "1980-05-23",
    rating_imdb: 8.4,
    rating_rotten_tomatoes: 83,
    rating_metacritic: 66,
    rating_tmdb: 8.2,
    genres: ["Horror"],
    origins: [],
    streaming: [],
    seasons: null,
    award_winner: false,
    award_nominee: false,
    vote_count: 18000,
  };
}

const ITEMS = [
  { rank: 1, media: card("movie-694", "The Shining") },
  { rank: 2, media: card("movie-348", "Alien") },
];

describe("readCollectionRows", () => {
  it("throws when the hub read fails", async () => {
    expect(
      await rejectionOf(readCollectionRows(stubSupabase({ collections: FAILED }))),
    ).toBeInstanceOf(DataUnavailableError);
  });

  it("returns no rows when the table is empty", async () => {
    expect(await readCollectionRows(stubSupabase({ collections: { data: [] } }))).toEqual([]);
  });
});

describe("readCollection", () => {
  it("throws when the list row read fails, rather than answering 404", async () => {
    const db = stubSupabase({ collections: FAILED });
    expect(await rejectionOf(readCollection("best-horror", db))).toBeInstanceOf(
      DataUnavailableError,
    );
  });

  it("returns null for a slug that is genuinely missing", async () => {
    const db = stubSupabase({ collections: { data: null } });
    expect(await readCollection("best-nothing-here", db)).toBeNull();
  });

  it("throws when a country shelf's pool read fails, rather than answering 404", async () => {
    const db = stubSupabase({ collections: { data: null }, media: FAILED });
    expect(await rejectionOf(readCollection("best-japanese-movies", db))).toBeInstanceOf(
      DataUnavailableError,
    );
  });

  it("returns null for a country shelf the gate refuses", async () => {
    const db = stubSupabase({ collections: { data: null }, media: { data: [], count: 0 } });
    expect(await readCollection("best-japanese-movies", db)).toBeNull();
  });

  it("throws when the ranked titles fail to read, rather than an empty list", async () => {
    const db = stubSupabase({
      collections: { data: LIST },
      collection_items: FAILED,
      collection_index_kept: { data: { kept: true } },
    });
    expect(await rejectionOf(readCollection("best-horror", db))).toBeInstanceOf(
      DataUnavailableError,
    );
  });

  it("renders a kept list as indexable and cacheable", async () => {
    const db = stubSupabase({
      collections: { data: LIST },
      collection_items: { data: ITEMS },
      collection_index_kept: { data: { kept: true } },
    });
    const d = await readCollection("best-horror", db);
    expect(d?.items.map((i) => i.title)).toEqual(["The Shining", "Alien"]);
    expect(d?.indexable).toBe(true);
    expect(d?.incomplete).toBeUndefined();
  });

  it("treats a list missing from the kept set as a cacheable noindex", async () => {
    const db = stubSupabase({
      collections: { data: LIST },
      collection_items: { data: ITEMS },
      collection_index_kept: { data: null },
    });
    const d = await readCollection("best-horror", db);
    expect(d?.indexable).toBe(false);
    expect(d?.incomplete).toBeUndefined();
  });

  it("marks the page incomplete when the kept-set lookup fails", async () => {
    // Today's default (noindex) still renders; the flag keeps it uncached.
    const db = stubSupabase({
      collections: { data: LIST },
      collection_items: { data: ITEMS },
      collection_index_kept: FAILED,
    });
    const d = await readCollection("best-horror", db);
    expect(d?.items.length).toBe(2);
    expect(d?.indexable).toBeUndefined();
    expect(d?.incomplete).toBe(true);
  });

  it("marks a person list incomplete when its backlink lookup fails", async () => {
    const db = stubSupabase({
      collections: {
        data: {
          ...LIST,
          slug: "best-sigourney-weaver-movies",
          kind: "person",
          title: "The Best Sigourney Weaver Movies",
        },
      },
      collection_items: { data: ITEMS },
      collection_index_kept: { data: { kept: true } },
      person_collection_roster: FAILED,
    });
    const d = await readCollection("best-sigourney-weaver-movies", db);
    expect(d?.person).toBeUndefined();
    expect(d?.incomplete).toBe(true);
  });
});
