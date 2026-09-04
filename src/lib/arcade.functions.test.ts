import { describe, expect, it } from "bun:test";
import {
  ERA_BANDS,
  SPEED_SORT_PAIRS,
  actorNames,
  buildCastingPins,
  buildLinkChain,
  buildSequelIds,
  containsShortTitle,
  daySeed,
  decodeMediaPin,
  deriveLinkActors,
  encodeMediaPin,
  eraBandFor,
  impostorFromSource,
  linkDistance,
  pickBalanced,
  pickDistinctIndexes,
  pickDistinctYears,
  pickImpostor,
  pickItemIds,
  pickTaglineSet,
  seededShuffle,
  sharesLongWord,
  speedSortPairFor,
  taglineOk,
  type ArcadePoolRow,
  type LinkRow,
  type TaglineCandidate,
} from "./arcade.functions";

// Pure helpers only. The server fns themselves do IO and are not exercised
// here; the pool filters and pickers below are the logic that decides what a
// day's round contains.

/** Structural equality via JSON; the local bun:test shim has no toEqual. */
const json = (v: unknown) => JSON.stringify(v);

describe("seededShuffle / daySeed", () => {
  it("is a deterministic permutation that leaves the input alone", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = seededShuffle(input, daySeed(12, 7));
    const b = seededShuffle(input, daySeed(12, 7));
    expect(json(a)).toBe(json(b));
    expect(json([...a].sort((x, y) => x - y))).toBe(json(input));
    expect(json(input)).toBe(json([1, 2, 3, 4, 5, 6, 7, 8]));
  });

  it("differs across days and salts", () => {
    const input = Array.from({ length: 20 }, (_, i) => i);
    expect(json(seededShuffle(input, daySeed(1, 7)))).not.toBe(
      json(seededShuffle(input, daySeed(2, 7))),
    );
    expect(json(seededShuffle(input, daySeed(1, 7)))).not.toBe(
      json(seededShuffle(input, daySeed(1, 8))),
    );
  });
});

describe("pickDistinctIndexes", () => {
  it("returns n distinct in-range indexes, deterministically", () => {
    const a = pickDistinctIndexes(42, 300, 8);
    expect(json(a)).toBe(json(pickDistinctIndexes(42, 300, 8)));
    expect(new Set(a).size).toBe(8);
    for (const i of a) {
      expect(i >= 0).toBe(true);
      expect(i).toBeLessThan(300);
    }
  });

  it("clamps to the pool and survives an empty one", () => {
    expect(pickDistinctIndexes(5, 3, 10).length).toBe(3);
    expect(json(pickDistinctIndexes(5, 0, 4))).toBe(json([]));
  });
});

describe("media pin encoding", () => {
  it("round-trips movies and tv", () => {
    expect(decodeMediaPin(encodeMediaPin("movie-603")!)).toBe("movie-603");
    expect(decodeMediaPin(encodeMediaPin("tv-83867")!)).toBe("tv-83867");
  });

  it("rejects malformed ids", () => {
    expect(encodeMediaPin("person-1")).toBe(null);
    expect(encodeMediaPin("movie-")).toBe(null);
    expect(encodeMediaPin("")).toBe(null);
  });
});

describe("sharesLongWord", () => {
  it("catches six-letter stems, inflected or not", () => {
    expect(sharesLongWord("The gladiators return home", "Gladiator")).toBe(true);
    expect(sharesLongWord("An inception of an idea", "Inception")).toBe(true);
  });

  it("ignores short shared words", () => {
    expect(sharesLongWord("The end of all things", "Endgame")).toBe(false);
    expect(sharesLongWord("No dream is ever just a dream.", "Inception")).toBe(false);
  });
});

describe("containsShortTitle", () => {
  it("flags a tiny title appearing as a word", () => {
    expect(containsShortTitle("One man saw it coming.", "It")).toBe(true);
    expect(containsShortTitle("Look up tonight", "Up")).toBe(true);
    expect(containsShortTitle("Quite the sight", "It")).toBe(false);
    expect(containsShortTitle("An offer you can't refuse.", "Heat")).toBe(false);
  });
});

describe("taglineOk", () => {
  it("accepts a clean tagline", () => {
    expect(taglineOk("Sin is a choice.", "The Counselor")).toBe(true);
  });

  it("rejects empty, leaking, stem-sharing, and over-long lines", () => {
    expect(taglineOk("  ", "Heat")).toBe(false);
    expect(taglineOk("The counselor will see you now", "The Counselor")).toBe(false);
    expect(taglineOk("Counselors never sleep", "The Counselor")).toBe(false);
    expect(taglineOk("x".repeat(91), "Heat")).toBe(false);
  });
});

const cand = (id: string, title: string, tagline: string): TaglineCandidate => ({
  id,
  title,
  year: "1999",
  tagline,
});

describe("pickTaglineSet", () => {
  const clean = [
    cand("movie-1", "Heat", "A city of thieves."),
    cand("movie-2", "Se7en", "Gluttony. Greed. Wrath."),
    cand("movie-3", "Alien", "In space no one hears you."),
    cand("movie-4", "Rocky", "His whole life was a million to one shot."),
    cand("movie-5", "Jaws", "Do not go in the water."),
    cand("movie-6", "Speed", "Get ready for rush hour."),
    cand("movie-7", "Casino", "No one stays lucky forever."),
  ];

  it("returns five clean, mutually non-leaking, unique-text picks", () => {
    const set = pickTaglineSet(clean, 33);
    expect(set === null).toBe(false);
    expect(set!.length).toBe(5);
    const texts = new Set(set!.map((s) => s.tagline.toLowerCase()));
    expect(texts.size).toBe(5);
    for (const a of set!) {
      for (const b of set!) {
        if (a.id === b.id) continue;
        expect(sharesLongWord(a.tagline, b.title)).toBe(false);
      }
    }
    expect(json(pickTaglineSet(clean, 33))).toBe(json(set));
  });

  it("keeps a tiny title off a board whose taglines contain its word", () => {
    const pool = [...clean.slice(0, 5), cand("movie-9", "It", "You'll float too.")];
    // "Do not go in the water" is clean, but Rocky's line contains "to one",
    // and the Alien line contains "one": craft an explicit conflict instead.
    const withIt = [...pool, cand("movie-10", "Speed", "It never slows down")];
    const set = pickTaglineSet(withIt, 14);
    if (set) {
      const ids = set.map((s) => s.id);
      // "It" and any tagline containing the word "it" cannot share a board.
      if (ids.includes("movie-9")) {
        for (const s of set) {
          expect(/\bit\b/i.test(s.tagline) && s.id !== "movie-9").toBe(false);
        }
      }
    }
  });

  it("drops a tagline that names another chosen title", () => {
    const pool = [
      ...clean.slice(0, 5),
      cand("movie-8", "Twister", "Faster than a shark, louder than jaws."),
    ];
    const set = pickTaglineSet(pool, 9);
    expect(set === null).toBe(false);
    const ids = set!.map((s) => s.id);
    // The Twister line leaks Jaws; the two cannot share a board.
    expect(ids.includes("movie-8") && ids.includes("movie-5")).toBe(false);
  });

  it("refuses a thin pool instead of shipping a short board", () => {
    expect(pickTaglineSet(clean.slice(0, 4), 12)).toBe(null);
    const allLeaky = clean.map((c) => ({ ...c, tagline: `About ${c.title} itself` }));
    expect(pickTaglineSet(allLeaky, 12)).toBe(null);
  });
});

describe("actorNames", () => {
  it("keeps actors (role = character name) and drops crew", () => {
    expect(
      json(
        actorNames([
          { name: "Daniel Radcliffe", role: "Harry Potter" },
          { name: "Chris Columbus", role: "Director" },
          { name: "Vince Gilligan", role: "Creator" },
          { name: "", role: "Ghost" },
        ]),
      ),
    ).toBe(json(["Daniel Radcliffe"]));
    expect(json(actorNames(null))).toBe(json([]));
  });
});

const row = (
  id: string,
  title: string,
  year: string,
  genres: string[],
  actors: string[],
): ArcadePoolRow => ({
  media_id: id,
  media_type: "movie",
  title,
  year,
  poster_url: "/p.jpg",
  genres,
  people: actors.map((name) => ({ name, role: "Someone" })),
});

describe("pickImpostor / impostorFromSource", () => {
  const movie = row(
    "movie-1",
    "Heat",
    "1995",
    ["Crime"],
    ["Al Pacino", "Robert De Niro", "Val Kilmer"],
  );
  const pool = [
    movie,
    row("movie-2", "Casino", "1995", ["Crime"], ["Robert De Niro", "Sharon Stone"]),
    row("movie-3", "Toy Story", "1995", ["Animation"], ["Tom Hanks"]),
    row("movie-4", "The Departed", "2006", ["Crime"], ["Leonardo DiCaprio"]),
  ];

  it("samples same genre, same decade, and an actor outside the cast", () => {
    const imp = pickImpostor(movie, pool, daySeed(3, 1), new Set());
    expect(imp === null).toBe(false);
    expect(imp!.sourceId).toBe("movie-2");
    expect(imp!.actor).toBe("Sharon Stone");
  });

  it("respects the exclusion set and fails soft", () => {
    expect(pickImpostor(movie, pool, daySeed(3, 1), new Set(["movie-2"]))).toBe(null);
  });

  it("re-derives the same impostor from a pinned source", () => {
    expect(impostorFromSource(pool[1], movie)).toBe("Sharon Stone");
  });
});

describe("buildCastingPins", () => {
  const pool: ArcadePoolRow[] = [];
  for (let i = 0; i < 24; i++) {
    pool.push(
      row(
        `movie-${i + 1}`,
        `Film ${i + 1}`,
        i % 2 === 0 ? "1994" : "1997",
        ["Drama"],
        [`Actor ${i}a`, `Actor ${i}b`, `Actor ${i}c`],
      ),
    );
  }

  it("pins eight movies and eight distinct sources", () => {
    const pins = buildCastingPins(pool, 21);
    expect(pins === null).toBe(false);
    expect(pins!.length).toBe(16);
    expect(new Set(pins!).size).toBe(16);
    expect(json(buildCastingPins(pool, 21))).toBe(json(pins));
  });

  it("refuses when the pool cannot fill eight rounds", () => {
    expect(buildCastingPins(pool.slice(0, 6), 21)).toBe(null);
  });
});

describe("pickDistinctYears", () => {
  it("returns rows with pairwise distinct years", () => {
    const rows = [
      { year: "1994" },
      { year: "1994" },
      { year: "1995" },
      { year: "1996" },
      { year: "1997" },
      { year: "1998" },
    ];
    const out = pickDistinctYears(rows, 5, daySeed(4, 2));
    expect(out === null).toBe(false);
    expect(out!.length).toBe(5);
    expect(new Set(out!.map((r) => r.year)).size).toBe(5);
  });

  it("refuses when distinct years run out", () => {
    expect(pickDistinctYears([{ year: "1999" }, { year: "1999" }], 2, daySeed(4, 2))).toBe(null);
  });
});

describe("eraBandFor / speedSortPairFor", () => {
  it("rotate deterministically without repeating on adjacent days", () => {
    expect(ERA_BANDS.includes(eraBandFor(123))).toBe(true);
    expect(eraBandFor(123)).toBe(eraBandFor(123 + ERA_BANDS.length));
    const n = SPEED_SORT_PAIRS.length;
    for (let d = 1; d <= n; d++) {
      expect(speedSortPairFor(d).key === speedSortPairFor(d + 1).key).toBe(false);
      expect(speedSortPairFor(d).key).toBe(speedSortPairFor(d + n).key);
    }
  });

  it("keeps the bins of every pair mutually exclusive", () => {
    const winner = {
      ...row("movie-1", "Titanic", "1997", [], []),
      awards_won: ["oscar"],
      award_wins: 11,
    };
    const loser = { ...row("movie-2", "Heat", "1995", [], []), awards_won: [], award_wins: 0 };
    const unknown = {
      ...row("movie-3", "Film", "1995", [], []),
      awards_won: null,
      award_wins: null,
    };
    const tv = { ...row("tv-1", "Show", "1995", [], []), media_type: "tv" };
    for (const pair of SPEED_SORT_PAIRS) {
      for (const r of [winner, loser, unknown, tv]) {
        expect(pair.a.test(r) && pair.b.test(r)).toBe(false);
      }
    }
    const oscar = SPEED_SORT_PAIRS.find((p) => p.key === "oscar")!;
    expect(oscar.a.test(winner)).toBe(true);
    expect(oscar.b.test(loser)).toBe(true);
    // A title with no awards data is never claimed to have won nothing.
    expect(oscar.b.test(unknown)).toBe(false);
  });
});

const link = (id: string, title: string, actors: string[]): LinkRow => ({
  id,
  mediaType: "movie",
  title,
  year: "2000",
  posterUrl: "/p.jpg",
  actors,
});

describe("deriveLinkActors", () => {
  it("derives start, link, and target from a two-title chain", () => {
    const chain = [link("movie-1", "A", ["Sam", "Link"]), link("movie-2", "B", ["Link", "Tess"])];
    expect(json(deriveLinkActors(chain))).toBe(
      json({ start: "Sam", links: ["Link"], target: "Tess" }),
    );
  });

  it("walks a three-title chain with two links", () => {
    const chain = [
      link("movie-1", "A", ["Sam", "L1"]),
      link("movie-2", "B", ["L1", "L2", "Extra"]),
      link("movie-3", "C", ["L2", "Tess"]),
    ];
    expect(json(deriveLinkActors(chain))).toBe(
      json({ start: "Sam", links: ["L1", "L2"], target: "Tess" }),
    );
  });

  it("fails when adjacent titles share no actor", () => {
    expect(deriveLinkActors([link("movie-1", "A", ["Sam"]), link("movie-2", "B", ["Tess"])])).toBe(
      null,
    );
  });
});

describe("linkDistance / buildLinkChain", () => {
  const pool = [
    link("movie-1", "A", ["Sam", "L1", "Ann"]),
    link("movie-2", "B", ["L1", "Tess", "Bob"]),
    link("movie-3", "C", ["Ann", "Cat"]),
    link("movie-4", "D", ["Cat", "Dan"]),
    link("movie-5", "E", ["Eve", "Fay"]),
    link("movie-6", "F", ["Fay", "Gus"]),
    link("movie-7", "G", ["Gus", "Hal"]),
    link("movie-8", "H", ["Hal", "Ivy"]),
  ];

  it("measures hops in titles and reports unreachable pairs", () => {
    expect(linkDistance(pool, "Sam", "L1")).toBe(1);
    expect(linkDistance(pool, "Sam", "Tess")).toBe(2);
    expect(linkDistance(pool, "Sam", "Dan")).toBe(3);
    expect(linkDistance(pool, "Sam", "Eve")).toBe(Infinity);
  });

  it("builds a chain whose derived pair is exactly the asked distance", () => {
    const chain = buildLinkChain(pool, 17, 2);
    expect(chain === null).toBe(false);
    expect(chain!.length).toBe(2);
    const actors = deriveLinkActors(chain!);
    expect(actors === null).toBe(false);
    expect(linkDistance(pool, actors!.start, actors!.target)).toBe(2);
    expect(json(buildLinkChain(pool, 17, 2)?.map((r) => r.id))).toBe(json(chain!.map((r) => r.id)));
  });

  it("refuses a pool with no qualifying chain", () => {
    expect(buildLinkChain(pool.slice(4), 17, 3)).toBe(null);
  });
});

describe("item pickers", () => {
  const items = Array.from({ length: 40 }, (_, i) => ({
    id: i + 1,
    difficulty: (i % 3) + 1,
    real: i % 2 === 0,
  }));

  it("pickItemIds returns n distinct ids from the pool", () => {
    const ids = pickItemIds(items, 9, 5);
    expect(ids === null).toBe(false);
    expect(ids!.length).toBe(5);
    expect(new Set(ids!).size).toBe(5);
    expect(json(pickItemIds(items, 9, 5))).toBe(json(ids));
    expect(pickItemIds(items.slice(0, 3), 9, 5)).toBe(null);
  });

  it("buildSequelIds keeps five real and five fake", () => {
    const ids = buildSequelIds(items, 9);
    expect(ids === null).toBe(false);
    expect(ids!.length).toBe(10);
    const byId = new Map(items.map((i) => [i.id, i]));
    expect(ids!.filter((id) => byId.get(id)!.real).length).toBe(5);
    expect(
      buildSequelIds(
        items.filter((i) => i.real),
        9,
      ),
    ).toBe(null);
  });

  it("pickBalanced honors the difficulty mix and refuses thin buckets", () => {
    const ids = pickBalanced(items, [3, 4, 3], 9);
    expect(ids === null).toBe(false);
    expect(ids!.length).toBe(10);
    const byId = new Map(items.map((i) => [i.id, i]));
    const mix = [1, 2, 3].map((d) => ids!.filter((id) => byId.get(id)!.difficulty === d).length);
    expect(json(mix)).toBe(json([3, 4, 3]));
    expect(
      pickBalanced(
        items.filter((i) => i.difficulty !== 3),
        [3, 4, 3],
        9,
      ),
    ).toBe(null);
  });
});
