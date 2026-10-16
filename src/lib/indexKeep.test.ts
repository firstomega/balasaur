import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  LIST_KEEP_MIN_ITEMS,
  LIST_MAX_PARENT_SHARE,
  LIST_NEVER_KEPT_KINDS,
  LIST_OVERLAP_TOP,
  PERSON_FAME_MIN_TITLE_VOTES,
  PERSON_FAME_TOP_TITLES,
  PERSON_FAME_TV_WEIGHT,
  PERSON_KEEP_COUNT,
  TITLE_KEEP_MIN_VOTES_MOVIE,
  TITLE_KEEP_MIN_VOTES_TV,
  TITLE_KEEP_PINNED,
  isIndexableList,
  isIndexablePerson,
  isIndexableTitle,
  isKeptTitle,
} from "./indexKeep";

// The kept sets are read by three callers that must agree: the page head
// (this module), the sitemaps and IndexNow (the SQL views). The SQL carries
// each constant as a literal with the TS name in a trailing comment, so these
// tests read the migration and fail if a number moves on one side only.
const MIGRATION = readFileSync(
  new URL("../../supabase/migrations/20261016010000_index_diet.sql", import.meta.url),
  "utf8",
);

/** The SQL text on the line tagged with this constant's name. */
function taggedLine(name: string): string {
  const lines = MIGRATION.split("\n").filter((l) => l.includes(`-- ${name}`));
  expect(lines.length).toBe(1);
  return lines[0].slice(0, lines[0].indexOf("--"));
}

const page = {
  overview: "A synopsis long enough to stand alone in a search result.",
  posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
  streaming: ["Netflix"],
  cast: [1, 2, 3],
  runtime: 148,
  ratings: { balasaur: 84, imdb: 8.8, rottenTomatoes: 87, metacritic: 74 },
};

describe("title kept set", () => {
  it("keeps a movie at the vote line and drops one just under it", () => {
    const at = { id: "movie-1", mediaType: "movie", voteCount: TITLE_KEEP_MIN_VOTES_MOVIE };
    expect(isKeptTitle(at)).toBe(true);
    expect(isKeptTitle({ ...at, voteCount: TITLE_KEEP_MIN_VOTES_MOVIE - 1 })).toBe(false);
  });

  it("asks less of a show than of a movie", () => {
    expect(TITLE_KEEP_MIN_VOTES_TV).toBeLessThan(TITLE_KEEP_MIN_VOTES_MOVIE);
    const show = { id: "tv-1", mediaType: "tv", voteCount: TITLE_KEEP_MIN_VOTES_TV };
    expect(isKeptTitle(show)).toBe(true);
    expect(isKeptTitle({ ...show, voteCount: TITLE_KEEP_MIN_VOTES_TV - 1 })).toBe(false);
    // The same count on a movie is far short.
    expect(isKeptTitle({ ...show, id: "movie-1", mediaType: "movie" })).toBe(false);
  });

  it("treats an unknown vote count as not enough", () => {
    expect(isKeptTitle({ id: "movie-1", mediaType: "movie" })).toBe(false);
    expect(isKeptTitle({ id: "tv-1", mediaType: "tv", voteCount: null })).toBe(false);
  });

  it("keeps a title Google already indexed, whatever its votes", () => {
    // El cor de la ciutat: 7 votes, indexed since August.
    expect(isKeptTitle({ id: "tv-14743", mediaType: "tv", voteCount: 7 })).toBe(true);
  });

  it("indexes a title page only when it can stand alone AND is kept", () => {
    const inception = { ...page, id: "movie-27205", mediaType: "movie", voteCount: 38000 };
    expect(isIndexableTitle(inception)).toBe(true);
    // Strong page, too few votes: reachable, but not offered.
    expect(isIndexableTitle({ ...inception, voteCount: 900 })).toBe(false);
    // Plenty of votes, nothing to say: still not offered.
    expect(isIndexableTitle({ ...inception, overview: "" })).toBe(false);
  });
});

describe("person and list pages", () => {
  it("offers a person or a list only on a confirmed yes", () => {
    expect(isIndexablePerson({ indexable: true })).toBe(true);
    expect(isIndexablePerson({ indexable: false })).toBe(false);
    // A failed lookup leaves the flag unset; the sitemap would not list it.
    expect(isIndexablePerson({})).toBe(false);
    expect(isIndexableList({ indexable: true })).toBe(true);
    expect(isIndexableList({})).toBe(false);
  });
});

describe("the SQL kept sets match the constants", () => {
  it("titles: same vote lines, same pins", () => {
    expect(taggedLine("TITLE_KEEP_MIN_VOTES_MOVIE")).toContain(
      `vote_count >= ${TITLE_KEEP_MIN_VOTES_MOVIE})`,
    );
    expect(taggedLine("TITLE_KEEP_MIN_VOTES_MOVIE")).toContain("media_type <> 'tv'");
    expect(taggedLine("TITLE_KEEP_MIN_VOTES_TV")).toContain(
      `media_type = 'tv' and im.vote_count >= ${TITLE_KEEP_MIN_VOTES_TV})`,
    );
    const pins = [...taggedLine("TITLE_KEEP_PINNED").matchAll(/'([a-z]+-\d+)'/g)].map((m) => m[1]);
    expect(pins).toEqual([...TITLE_KEEP_PINNED]);
  });

  it("titles: the kept view narrows the substance gate rather than replacing it", () => {
    expect(
      /create or replace view public\.index_kept_media[\s\S]*?from public\.indexable_media im/.test(
        MIGRATION,
      ),
    ).toBe(true);
  });

  it("people: same fame recipe and the same cut", () => {
    expect(taggedLine("PERSON_FAME_MIN_TITLE_VOTES")).toContain(
      `vote_count >= ${PERSON_FAME_MIN_TITLE_VOTES}`,
    );
    expect(taggedLine("PERSON_FAME_TV_WEIGHT")).toContain(
      `when media_type = 'tv' then ${PERSON_FAME_TV_WEIGHT} else 1`,
    );
    expect(taggedLine("PERSON_FAME_TOP_TITLES")).toContain(`k <= ${PERSON_FAME_TOP_TITLES}`);
    expect(taggedLine("PERSON_KEEP_COUNT")).toContain(`fame_rank <= ${PERSON_KEEP_COUNT}`);
  });

  it("lists: same size floor, same overlap window, same share, same excluded kinds", () => {
    expect(taggedLine("LIST_KEEP_MIN_ITEMS")).toContain(`item_count >= ${LIST_KEEP_MIN_ITEMS}`);
    expect(taggedLine("LIST_OVERLAP_TOP")).toContain(`rank <= ${LIST_OVERLAP_TOP}`);
    // "max_shared * 2 < top_count" is "under half" written without division.
    expect(LIST_MAX_PARENT_SHARE).toBe(0.5);
    expect(taggedLine("LIST_MAX_PARENT_SHARE")).toContain("max_shared * 2 < top_count");
    expect(taggedLine("LIST_NEVER_KEPT_KINDS")).toContain(`kind <> '${LIST_NEVER_KEPT_KINDS[0]}'`);
    expect(LIST_NEVER_KEPT_KINDS.length).toBe(1);
  });

  it("lists: a cross is compared with each of its parents", () => {
    // Horror Movies on Netflix against Horror Movies and Movies on Netflix.
    const slug = "best-horror-movies-on-netflix";
    expect(slug.replace(/^best-(.+)-(movies|shows)-on-(.+)$/, "best-$1-$2")).toBe(
      "best-horror-movies",
    );
    expect(slug.replace(/^best-(.+)-(movies|shows)-on-(.+)$/, "best-$2-on-$3")).toBe(
      "best-movies-on-netflix",
    );
    expect(MIGRATION).toContain("'^best-(.+)-(movies|shows)-on-(.+)$', 'best-\\1-\\2'");
    expect(MIGRATION).toContain("'^best-(.+)-(movies|shows)-on-(.+)$', 'best-\\2-on-\\3'");
    // A year against its decade: best-shows-of-1999 -> best-shows-of-the-1990s.
    expect(
      "best-shows-of-1999".replace(
        /^best-(movies|shows)-of-([0-9]{3})[0-9]$/,
        "best-$1-of-the-$20s",
      ),
    ).toBe("best-shows-of-the-1990s");
    expect(MIGRATION).toContain(
      "'^best-(movies|shows)-of-([0-9]{3})[0-9]$', 'best-\\1-of-the-\\20s'",
    );
  });
});

describe("every consumer reads the kept sets", () => {
  it("IndexNow announces only kept titles and kept lists", () => {
    expect(MIGRATION).toContain(
      "replace(d, 'from public.indexable_media im', 'from public.index_kept_media im')",
    );
    expect(MIGRATION).toContain(
      "where slug in (select slug from public.collection_index_kept where kept)",
    );
  });

  it("the sitemaps read the same views the page heads read", () => {
    const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
    expect(read("./media.server.ts")).toContain('.from("index_kept_media")');
    expect(read("./media.server.ts")).toContain('.from("person_index_kept")');
    expect(read("./collections.functions.ts")).toContain('.from("collection_index_kept")');
    expect(read("../routes/sitemap-people[.]xml.tsx")).toContain('.from("person_index_kept")');
    const pages = read("../routes/sitemap-pages[.]xml.tsx");
    expect(pages).toContain('.from("collection_index_kept")');
    expect(pages).toContain('.eq("kept", true)');
  });

  it("no sitemap carries a lastmod the nightly refresh would always bump", () => {
    const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
    for (const p of [
      "../routes/sitemap-titles[.]xml.tsx",
      "../routes/sitemap-people[.]xml.tsx",
      "../routes/sitemap-pages[.]xml.tsx",
    ]) {
      expect(read(p)).not.toContain("lastmod:");
    }
  });

  it("the people sitemap is not ordered by credit count", () => {
    const src = readFileSync(
      new URL("../routes/sitemap-people[.]xml.tsx", import.meta.url),
      "utf8",
    );
    expect(src).not.toContain('.order("titles"');
  });
});

describe("retired lists and the index panel", () => {
  it("redirects all thirteen retired lists, each to a materialized list", () => {
    const block = MIGRATION.slice(
      MIGRATION.indexOf("insert into public.collection_redirects"),
      MIGRATION.indexOf("on conflict (from_slug) do nothing;"),
    );
    const rows = [...block.matchAll(/\('(best-[a-z0-9-]+)', '(best-[a-z0-9-]+)'\)/g)];
    expect(rows.length).toBe(13);
    // The canary fails on a redirect to a slug the collections table lacks,
    // and only the request-time country shelves are missing from it.
    for (const [, , to] of rows) {
      expect(
        /^best-(korean|japanese|chinese|indian|french|spanish|british)-(movies|shows)$/.test(to),
      ).toBe(false);
    }
    expect(block).toContain(
      "where exists (select 1 from public.collections c where c.slug = v.to_slug)",
    );
  });

  it("swaps panel rows one for one, so the panel stays at 100 and its mix holds", () => {
    const deleted = MIGRATION.slice(
      MIGRATION.indexOf("delete from public.index_panel"),
      MIGRATION.indexOf("insert into public.index_panel"),
    ).match(/'https:\/\/balasaur\.com\/[^']+'/g);
    const inserted = [
      ...MIGRATION.matchAll(/\('(https:\/\/balasaur\.com\/[^']+)', '([a-z]+)', '2026-10-16'/g),
    ];
    expect(deleted?.length).toBe(inserted.length);
    const family = (u: string) => (u.includes("/person/") ? "person" : "collection");
    const out = (deleted ?? []).map((u) => family(u.slice(1, -1))).sort();
    expect(inserted.map((m) => m[2]).sort()).toEqual(out);
  });
});

describe("the nightly jobs that read the kept sets", () => {
  it("the people refresh fills an empty view instead of failing every night", () => {
    // A concurrent refresh raises on a view that was never filled, which is
    // the state this migration leaves it in until the follow-up runs.
    const start = MIGRATION.indexOf("select cron.schedule('person-index-kept-refresh'");
    const job = MIGRATION.slice(start, MIGRATION.indexOf("$job$\n$$);", start));
    expect(job).toContain("ispopulated");
    expect(job).toContain("refresh materialized view concurrently public.person_index_kept;");
    expect(job).toContain("else\n    refresh materialized view public.person_index_kept;");
  });

  it("the list refresh fills an empty view instead of failing every night", () => {
    const start = MIGRATION.indexOf("select cron.schedule('collection-index-kept-refresh'");
    const job = MIGRATION.slice(start, MIGRATION.indexOf("$job$\n$$);", start));
    expect(job).toContain("ispopulated");
    expect(job).toContain("refresh materialized view concurrently public.collection_index_kept;");
    expect(job).toContain("else\n    refresh materialized view public.collection_index_kept;");
  });

  it("the inspection sample draws from the kept sets and keeps its three windows", () => {
    const start = MIGRATION.indexOf("create or replace function public.index_status_sample()");
    const fn = MIGRATION.slice(start, MIGRATION.indexOf("$$;", start));
    expect(fn).toContain("from collection_index_kept\n  where kept");
    expect(fn).toContain("from index_kept_media");
    expect(fn).toContain("from person_index_kept");
    expect(/from (collections|indexable_media|person_index)\b(?!_)/.test(fn)).toBe(false);
    const windows = [...fn.matchAll(/\) < (\d+)\s*$/gm)].map((m) => Number(m[1]));
    // Same windows as 20261015120200_index_panel.sql: 35 lists, 45 titles, 20 people.
    expect(windows).toEqual([35, 45, 20]);
  });
});
