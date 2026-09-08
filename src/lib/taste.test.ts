import { describe, expect, it } from "bun:test";
import type { StatusMap, UserStatusRecord } from "@/hooks/useUserStatus";
import {
  ARCHETYPES,
  CONTRARIAN_CRITIC_MAX,
  MIN_BASIS_TITLES,
  computeTaste,
  tasteReadiness,
  type TitleFact,
} from "./taste";

/** Structural equality via JSON; the local bun:test shim has no toEqual. */
const json = (v: unknown) => JSON.stringify(v);

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

let seq = 0;
function fact(over: Partial<TitleFact> = {}): TitleFact {
  seq++;
  return {
    id: over.id ?? `movie-${seq}`,
    title: over.title ?? `Title ${seq}`,
    year: over.year ?? "2010",
    mediaType: over.mediaType ?? "movie",
    genres: over.genres ?? [],
    origins: over.origins ?? ["American"],
    posterUrl: "posterUrl" in over ? over.posterUrl : `/p${seq}.jpg`,
    score: over.score,
    critic: over.critic,
    criticSource: over.criticSource,
  };
}

const liked: UserStatusRecord = { status: "seen", sentiment: "liked", ts: 1 };
const watched: UserStatusRecord = { status: "seen", ts: 1 };
const want: UserStatusRecord = { status: "unseen", intent: "want", ts: 1 };

/** Build a library where every fact is filed under `rec`. */
function library(facts: TitleFact[], rec: UserStatusRecord = liked): StatusMap {
  const m: StatusMap = {};
  for (const f of facts) m[f.id] = { ...rec };
  return m;
}

/** n facts sharing one shape, so a share is exact rather than nearly right. */
function many(n: number, over: Partial<TitleFact> = {}): TitleFact[] {
  return Array.from({ length: n }, () => fact(over));
}

function profileOf(facts: TitleFact[], rec: UserStatusRecord = liked) {
  return computeTaste(library(facts, rec), facts);
}

// ---------------------------------------------------------------------------

describe("tasteReadiness", () => {
  it("reports nothing to draw for an empty library", () => {
    const r = tasteReadiness({});
    expect(json(r)).toBe(
      json({ liked: 0, watched: 0, want: 0, ready: false, needed: MIN_BASIS_TITLES }),
    );
  });

  it("counts liked inside watched, and want separately", () => {
    const m: StatusMap = { a: liked, b: watched, c: want, d: { status: "skipped", ts: 1 } };
    const r = tasteReadiness(m);
    expect(r.liked).toBe(1);
    expect(r.watched).toBe(2);
    expect(r.want).toBe(1);
  });

  it("counts a not-interested record in no bucket", () => {
    const r = tasteReadiness({ a: { status: "unseen", intent: "not_interested", ts: 1 } });
    expect(json(r)).toBe(
      json({ liked: 0, watched: 0, want: 0, ready: false, needed: MIN_BASIS_TITLES }),
    );
  });

  it("is ready exactly at the floor, from either list", () => {
    const atFloor = library(many(MIN_BASIS_TITLES), liked);
    expect(tasteReadiness(atFloor).ready).toBe(true);
    expect(tasteReadiness(atFloor).needed).toBe(0);

    const oneShort = library(many(MIN_BASIS_TITLES - 1), watched);
    expect(tasteReadiness(oneShort).ready).toBe(false);
    expect(tasteReadiness(oneShort).needed).toBe(1);
  });

  it("survives a corrupt localStorage entry", () => {
    const m = { a: null, b: undefined, c: liked } as unknown as StatusMap;
    expect(tasteReadiness(m).liked).toBe(1);
  });
});

describe("computeTaste, empty and tiny libraries", () => {
  it("names no archetype for an empty library", () => {
    const p = computeTaste({}, []);
    expect(p.archetype).toBe(null);
    expect(p.total).toBe(0);
    expect(p.needed).toBe(MIN_BASIS_TITLES);
    expect(p.posters.length).toBe(0);
    expect(p.contrarian).toBe(null);
    expect(p.decadeCount).toBe(0);
  });

  it("refuses to name one title short of the floor and says how many are left", () => {
    const p = profileOf(many(MIN_BASIS_TITLES - 1, { genres: ["Horror"] }));
    expect(p.archetype).toBe(null);
    expect(p.needed).toBe(1);
  });

  it("names one exactly at the floor", () => {
    const p = profileOf(many(MIN_BASIS_TITLES, { genres: ["Horror"] }));
    expect(p.archetype?.key).toBe("gorehound");
    expect(p.needed).toBe(0);
  });

  it("counts a title with no catalog row but never lets it into a share", () => {
    const known = many(MIN_BASIS_TITLES, { genres: ["Horror"] });
    const m = library(known);
    m["movie-ghost"] = liked;
    const p = computeTaste(m, known);
    expect(p.counts.liked).toBe(MIN_BASIS_TITLES + 1);
    expect(p.total).toBe(MIN_BASIS_TITLES);
    expect(p.archetype?.evidence).toBe("Horror is 100% of what you Loved.");
  });
});

describe("the basis", () => {
  it("describes the Loved list once there is enough of one", () => {
    const p = profileOf(many(MIN_BASIS_TITLES, { genres: ["Comedy"] }), liked);
    expect(p.basis).toBe("loved");
    expect(p.archetype?.evidence).toContain("what you Loved");
  });

  it("falls back to the watched list and says so", () => {
    const p = profileOf(many(20, { genres: ["Comedy"] }), watched);
    expect(p.basis).toBe("watched");
    expect(p.total).toBe(20);
    expect(p.archetype?.evidence).toBe("Comedy is 100% of what you have watched.");
  });

  it("switches to Loved the moment the Loved list reaches the floor", () => {
    const lovedFacts = many(MIN_BASIS_TITLES, { genres: ["Horror"] });
    const seenFacts = many(30, { genres: ["Comedy"] });
    const m: StatusMap = { ...library(lovedFacts, liked), ...library(seenFacts, watched) };
    const p = computeTaste(m, [...lovedFacts, ...seenFacts]);
    expect(p.basis).toBe("loved");
    expect(p.total).toBe(MIN_BASIS_TITLES);
    expect(p.archetype?.key).toBe("gorehound");
  });

  it("never counts a watchlist title in the basis", () => {
    const seen = many(10, { genres: ["Horror"] });
    const queued = many(50, { genres: ["Comedy"] });
    const m: StatusMap = { ...library(seen, watched), ...library(queued, want) };
    const p = computeTaste(m, [...seen, ...queued]);
    expect(p.total).toBe(10);
    expect(p.counts.want).toBe(50);
    expect(p.archetype?.key).toBe("gorehound");
  });
});

describe("archetype boundaries", () => {
  /** Build a 100-title library where `hits` of them match `shape`. */
  function atShare(hits: number, shape: Partial<TitleFact>, rest: Partial<TitleFact> = {}) {
    return profileOf([...many(hits, shape), ...many(100 - hits, rest)]);
  }

  it("fires Midnight Gorehound at exactly 30% horror, not at 29%", () => {
    expect(atShare(29, { genres: ["Horror"] }).archetype?.key).not.toBe("gorehound");
    expect(atShare(30, { genres: ["Horror"] }).archetype?.key).toBe("gorehound");
    expect(atShare(30, { genres: ["Horror"] }).archetype?.evidence).toBe(
      "Horror is 30% of what you Loved.",
    );
  });

  it("fires Archive Diver at exactly a quarter before 1980", () => {
    expect(atShare(24, { year: "1974" }, { year: "2015" }).archetype?.key).not.toBe("archive");
    const p = atShare(25, { year: "1974" }, { year: "2015" });
    expect(p.archetype?.key).toBe("archive");
    expect(p.archetype?.evidence).toBe("25% of what you Loved came out before 1980.");
  });

  it("counts 1980 itself as after 1980", () => {
    expect(atShare(40, { year: "1980" }, { year: "2015" }).archetype?.key).not.toBe("archive");
  });

  it("fires Subtitle Reader on language buckets, not on British or American", () => {
    expect(atShare(40, { origins: ["British"] }).archetype?.key).not.toBe("subtitles");
    const p = atShare(30, { origins: ["Korean"] });
    expect(p.archetype?.key).toBe("subtitles");
    expect(p.archetype?.evidence).toBe("Non-English titles are 30% of what you Loved.");
  });

  it("fires Critic Proof on a critic score under 60, and treats a missing score as no match", () => {
    expect(atShare(50, { critic: undefined }).archetype?.key).not.toBe("criticproof");
    expect(atShare(29, { critic: 59 }, { critic: 80 }).archetype?.key).not.toBe("criticproof");
    const p = atShare(30, { critic: 59 }, { critic: 80 });
    expect(p.archetype?.key).toBe("criticproof");
    expect(p.archetype?.evidence).toBe("30% of what you Loved scored under 60 with critics.");
    expect(atShare(40, { critic: 60 }, { critic: 80 }).archetype?.key).not.toBe("criticproof");
  });

  it("fires High Bar at 85, not at 84", () => {
    expect(atShare(40, { score: 84 }, { score: 50 }).archetype?.key).not.toBe("highbar");
    const p = atShare(35, { score: 85 }, { score: 50 });
    expect(p.archetype?.key).toBe("highbar");
    expect(p.archetype?.evidence).toBe("35% of what you Loved scores 85 or better.");
  });

  it("needs both halves of Prestige Bingeer", () => {
    const tvOnly = profileOf(many(20, { mediaType: "tv", score: 60 }));
    expect(tvOnly.archetype?.key).not.toBe("prestige");

    const both = profileOf([
      ...many(10, { mediaType: "tv", score: 90 }),
      ...many(10, { mediaType: "movie", score: 40 }),
    ]);
    expect(both.archetype?.key).toBe("prestige");
    expect(both.archetype?.evidence).toBe(
      "TV is 50% of what you Loved, and 50% scores 80 or better.",
    );
  });

  it("unions the genres a rule names", () => {
    const p = profileOf([
      ...many(20, { genres: ["Crime"] }),
      ...many(15, { genres: ["Mystery"] }),
      ...many(11, { genres: ["Thriller"] }),
      ...many(54, { genres: ["Drama"] }),
    ]);
    expect(p.archetype?.key).toBe("crime");
    expect(p.archetype?.evidence).toBe("Crime, mystery and thriller cover 46% of what you Loved.");
  });

  it("counts a title in a union rule once, not once per matching genre", () => {
    const p = profileOf([
      ...many(45, { genres: ["Crime", "Mystery", "Thriller"] }),
      ...many(55, { genres: ["Drama"] }),
    ]);
    expect(p.archetype?.key).toBe("crime");
    expect(p.archetype?.evidence).toBe("Crime, mystery and thriller cover 45% of what you Loved.");
  });

  it("falls back to Wide Net when nothing concentrates", () => {
    const p = profileOf([
      ...many(20, { genres: ["Drama"] }),
      ...many(20, { genres: ["History"] }),
      ...many(20, { genres: ["Music"] }),
      ...many(20, { genres: ["War"] }),
      ...many(20, { genres: ["Western"] }),
    ]);
    expect(p.archetype?.key).toBe("widenet");
    expect(p.archetype?.evidence).toBe("No genre is more than 20% of what you Loved.");
  });

  it("still names Wide Net when the catalog rows carry no genres at all", () => {
    const p = profileOf(many(12, { genres: [], year: "2015", origins: [] }));
    expect(p.archetype?.key).toBe("widenet");
    expect(p.archetype?.evidence).toBe("12 titles, and no genre on any of them.");
  });
});

describe("archetype ties and competition", () => {
  it("picks the rule cleared by the widest margin, not the first in the table", () => {
    // Horror clears 30% by a hair; comedy clears 35% by a mile.
    const p = profileOf([...many(31, { genres: ["Horror"] }), ...many(69, { genres: ["Comedy"] })]);
    expect(p.archetype?.key).toBe("laughs");
  });

  it("breaks an exact tie by table order, so the same library always answers the same", () => {
    // Horror and comedy both sit exactly on their thresholds: margin 0 each.
    const facts = [
      ...many(30, { genres: ["Horror"] }),
      ...many(35, { genres: ["Comedy"] }),
      ...many(35, { genres: ["Drama"] }),
    ];
    const first = profileOf(facts);
    expect(first.archetype?.key).toBe("gorehound");
    // Same facts, reversed: the answer must not move.
    expect(computeTaste(library(facts), [...facts].reverse()).archetype?.key).toBe("gorehound");
  });

  it("gives one title with several genres to every rule it satisfies", () => {
    const p = profileOf(many(10, { genres: ["Horror", "Comedy"] }));
    // Both are 100%, both margins are 1; table order gives horror.
    expect(p.archetype?.key).toBe("gorehound");
    expect(p.archetype?.evidence).toBe("Horror is 100% of what you Loved.");
  });
});

describe("counts, decades and genres", () => {
  it("reports the three counts from the status map, not from the catalog", () => {
    const l = many(3);
    const w = many(4);
    const q = many(5);
    const m: StatusMap = {
      ...library(l, liked),
      ...library(w, watched),
      ...library(q, want),
    };
    const p = computeTaste(m, [...l, ...w, ...q]);
    expect(json(p.counts)).toBe(json({ liked: 3, watched: 7, want: 5 }));
  });

  it("buckets years into decades, most-populated first", () => {
    const p = profileOf([
      ...many(3, { year: "1994" }),
      ...many(2, { year: "2001" }),
      ...many(5, { year: "2019" }),
      ...many(1, { year: "" }),
    ]);
    expect(json(p.decades)).toBe(
      json([
        { decade: 2010, count: 5 },
        { decade: 1990, count: 3 },
        { decade: 2000, count: 2 },
      ]),
    );
    expect(p.decadeCount).toBe(3);
  });

  it("ranks the top three genres and breaks a tie by name", () => {
    const p = profileOf([
      ...many(5, { genres: ["Drama"] }),
      ...many(3, { genres: ["Comedy"] }),
      ...many(3, { genres: ["Action"] }),
      ...many(1, { genres: ["War"] }),
    ]);
    expect(json(p.topGenres.map((g) => g.genre))).toBe(json(["Drama", "Action", "Comedy"]));
    expect(json(p.topGenres[0])).toBe(json({ genre: "Drama", count: 5, share: 5 / 12 }));
  });
});

describe("posters", () => {
  it("takes the four highest scores, in order", () => {
    const p = profileOf([
      fact({ title: "D", score: 60 }),
      fact({ title: "A", score: 95 }),
      fact({ title: "C", score: 70 }),
      fact({ title: "B", score: 88 }),
      fact({ title: "E", score: 50 }),
      ...many(5, { score: 10 }),
    ]);
    expect(json(p.posters.map((x) => x.title))).toBe(json(["A", "B", "C", "D"]));
    expect(p.posters[0].score).toBe(95);
  });

  it("skips a title with no poster and one with no score", () => {
    const p = profileOf([
      fact({ title: "NoPoster", score: 99, posterUrl: undefined }),
      fact({ title: "NoScore", score: undefined }),
      fact({ title: "Fine", score: 70 }),
      ...many(9, { score: 10 }),
    ]);
    expect(p.posters.map((x) => x.title)).not.toContain("NoPoster");
    expect(p.posters.map((x) => x.title)).not.toContain("NoScore");
    expect(p.posters[0].title).toBe("Fine");
  });

  it("breaks a score tie by title so the row never reshuffles between draws", () => {
    const p = profileOf([
      fact({ title: "Zulu", score: 80 }),
      fact({ title: "Alpha", score: 80 }),
      fact({ title: "Mike", score: 80 }),
      ...many(9, { score: 10 }),
    ]);
    expect(json(p.posters.slice(0, 3).map((x) => x.title))).toBe(json(["Alpha", "Mike", "Zulu"]));
  });

  it("returns fewer than four rather than padding", () => {
    const p = profileOf([fact({ score: 80 }), ...many(9, { score: undefined })]);
    expect(p.posters.length).toBe(1);
  });
});

describe("the contrarian pick", () => {
  it("is the Loved title critics scored lowest", () => {
    const p = profileOf([
      fact({ title: "Venom", critic: 31 }),
      fact({ title: "Battleship", critic: 41 }),
      fact({ title: "Parasite", critic: 96 }),
      ...many(9),
    ]);
    expect(p.contrarian?.line).toBe("You liked Venom. Critics gave it 31.");
    expect(p.contrarian?.title).toBe("Venom");
  });

  it("stays silent when nothing was panned", () => {
    const p = profileOf(many(12, { critic: CONTRARIAN_CRITIC_MAX + 1 }));
    expect(p.contrarian).toBe(null);
  });

  it("includes a title sitting exactly on the cutoff", () => {
    const p = profileOf([fact({ title: "Edge", critic: CONTRARIAN_CRITIC_MAX }), ...many(9)]);
    expect(p.contrarian?.title).toBe("Edge");
  });

  it("comes from the Loved list even when the archetype describes the watched list", () => {
    const loved = [fact({ title: "Venom", critic: 31 })];
    const seen = many(20, { critic: 20, genres: ["Comedy"] });
    const m: StatusMap = { ...library(loved, liked), ...library(seen, watched) };
    const p = computeTaste(m, [...loved, ...seen]);
    expect(p.basis).toBe("watched");
    expect(p.contrarian?.title).toBe("Venom");
  });

  it("stays silent when the panned title was watched but never Loved", () => {
    const p = profileOf(many(12, { critic: 20 }), watched);
    expect(p.contrarian).toBe(null);
  });

  it("breaks a tie by title", () => {
    const p = profileOf([
      fact({ title: "Zardoz", critic: 30 }),
      fact({ title: "Alone", critic: 30 }),
      ...many(9),
    ]);
    expect(p.contrarian?.title).toBe("Alone");
  });
});

describe("the published table", () => {
  it("gives every archetype a name and a rule a reader can check", () => {
    expect(ARCHETYPES.length).toBeGreaterThan(11);
    for (const a of ARCHETYPES) {
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.rule.endsWith(".")).toBe(true);
      expect(a.rule).not.toContain("—");
    }
  });

  it("has no duplicate keys or names", () => {
    expect(new Set(ARCHETYPES.map((a) => a.key)).size).toBe(ARCHETYPES.length);
    expect(new Set(ARCHETYPES.map((a) => a.name)).size).toBe(ARCHETYPES.length);
  });

  it("can name every one of them from some library", () => {
    const named = new Set<string>();
    const cases: TitleFact[][] = [
      many(10, { genres: ["Horror"] }),
      [...many(10, { mediaType: "tv", score: 90 }), ...many(2, { score: 10 })],
      many(10, { year: "1968" }),
      many(10, { origins: ["Korean"] }),
      many(10, { genres: ["Comedy"] }),
      many(10, { genres: ["Crime"] }),
      many(10, { genres: ["Science Fiction"] }),
      many(10, { genres: ["Adventure"] }),
      many(10, { genres: ["Animation"] }),
      many(10, { genres: ["Documentary"] }),
      many(10, { genres: ["Romance"] }),
      many(10, { critic: 20 }),
      many(10, { score: 95 }),
      [
        ...many(2, { genres: ["Drama"] }),
        ...many(2, { genres: ["History"] }),
        ...many(2, { genres: ["Music"] }),
        ...many(2, { genres: ["War"] }),
        ...many(2, { genres: ["Western"] }),
      ],
    ];
    for (const c of cases) {
      const key = profileOf(c).archetype?.key;
      if (key) named.add(key);
    }
    expect(json([...named].sort())).toBe(json([...ARCHETYPES.map((a) => a.key)].sort()));
  });
});

describe("the real library on file", () => {
  // The 84 watched titles of the largest account in the database on
  // 2026-09-08, reduced to the facts the rules read. This is here so a
  // threshold change has to explain itself against a person, not a fixture.
  const REAL: Array<[genres: string[], year: string, critic: number | undefined, score: number]> = [
    [["Animation", "Action", "Adventure", "Science Fiction", "Fantasy"], "2021", undefined, 89],
    [["Family", "Comedy", "Animation", "Adventure"], "1995", 96, 89],
    [["Animation", "Comedy", "Science Fiction", "Fantasy", "Action", "Adventure"], "2013", undefined, 89], // prettier-ignore
    [["Adventure", "Action", "Science Fiction"], "1977", 90, 88],
    [["Animation", "Family", "Science Fiction"], "2008", 95, 88],
    [["Animation", "Family", "Adventure", "Drama", "Comedy"], "2015", 94, 87],
    [["Animation", "Drama", "Science Fiction", "Fantasy", "Action", "Adventure"], "2021", undefined, 87], // prettier-ignore
    [["Animation", "Action", "Adventure", "Science Fiction"], "2018", 87, 87],
    [["Animation", "Comedy", "Family", "Adventure"], "2009", 88, 87],
    [["Animation", "Action", "Adventure", "Science Fiction"], "2023", 86, 87],
    [["Animation", "Family", "Adventure"], "2003", 90, 87],
    [["Action", "Adventure", "Mystery", "Science Fiction", "Fantasy"], "2016", undefined, 86],
    [["Family", "Animation", "Music", "Adventure"], "2017", 81, 86],
    [["Adventure", "Science Fiction", "Action"], "2019", 78, 85],
    [["Science Fiction", "Fantasy", "Action", "Adventure"], "2019", undefined, 85],
    [["Adventure", "Action", "Fantasy"], "2026", 88, 85],
    [["Action", "Adventure", "Animation", "Science Fiction", "Fantasy"], "2026", undefined, 85],
    [["Science Fiction", "Adventure"], "2026", 77, 84],
    [["Animation", "Adventure", "Family", "Comedy"], "2016", 78, 83],
    [["Drama"], "2011", undefined, 83],
    [["Fantasy", "Adventure", "Animation", "Family"], "2010", 75, 83],
    [["Horror", "Thriller"], "2026", 77, 82],
    [["Action", "Adventure", "Science Fiction", "Fantasy"], "2023", undefined, 82],
    [["Action", "Drama", "Science Fiction"], "2017", 77, 82],
    [["Science Fiction", "Drama", "Adventure"], "2015", 80, 82],
    [["Action", "Adventure", "Animation", "Family"], "2004", 90, 82],
    [["Action", "Science Fiction", "Adventure"], "2008", 79, 82],
    [["Family", "Comedy", "Animation", "Adventure"], "2019", 84, 82],
    [["Action", "Science Fiction", "Adventure"], "2014", 76, 81],
    [["Action", "Adventure", "Science Fiction"], "2021", 71, 81],
    [["Adventure", "Action", "Science Fiction"], "2018", 68, 81],
    [["Action", "Adventure", "Science Fiction"], "2018", 88, 81],
    [["Adventure", "Drama", "Science Fiction"], "2014", 74, 81],
    [["Action", "Adventure", "Science Fiction"], "2014", 75, 80],
    [["Science Fiction", "Action", "Adventure"], "2009", 83, 80],
    [["Action", "Adventure", "Science Fiction"], "2004", 83, 80],
    [["Action", "Thriller", "Crime"], "2023", 78, 80],
    [["Science Fiction", "Action", "Adventure"], "2012", 69, 80],
    [["Adventure", "Family", "Animation", "Action", "Comedy"], "2014", 74, 80],
    [["Adventure", "Action", "Science Fiction"], "2016", 75, 79],
    [["Animation", "Family", "Comedy", "Adventure"], "2026", 73, 79],
    [["Horror", "Thriller", "Science Fiction"], "2026", 81, 78],
    [["Adventure", "Animation", "Comedy", "Family"], "1998", 78, 77],
    [["Animation", "Family", "Adventure", "Fantasy"], "2013", 75, 77],
    [["Science Fiction", "Action", "Adventure"], "2026", 66, 77],
    [["Action", "Adventure", "Science Fiction"], "2017", 73, 77],
    [["Action", "Science Fiction"], "2002", 73, 77],
    [["Action", "Adventure", "Science Fiction"], "2019", 69, 76],
    [["Adventure", "Action", "Science Fiction"], "2017", 84, 76],
    [["Science Fiction", "Adventure", "Action"], "2023", 64, 76],
    [["Action", "Adventure", "Drama", "Science Fiction", "Fantasy"], "2023", undefined, 76],
    [["Action", "Science Fiction", "Adventure"], "2025", 71, 76],
    [["Adventure", "Fantasy", "Action"], "2003", 63, 76],
    [["Action", "Adventure", "Mystery"], "2026", undefined, 76],
    [["Comedy", "Adventure", "Fantasy"], "2023", 80, 75],
    [["Action", "Adventure", "Science Fiction"], "2022", 67, 74],
    [["Science Fiction", "Fantasy", "Action", "Adventure"], "2023", undefined, 74],
    [["Action", "Science Fiction", "Adventure"], "2025", 68, 74],
    [["Fantasy", "Family", "Action", "Adventure"], "2025", 61, 74],
    [["Action", "Drama", "History"], "2006", 68, 73],
    [["Action", "Adventure", "Science Fiction"], "2018", 70, 73],
    [["Science Fiction", "Adventure", "Action"], "2025", 68, 73],
    [["Adventure", "Family", "Fantasy"], "2005", 75, 72],
    [["Action", "Adventure", "Science Fiction"], "2015", 66, 72],
    [["Action", "Comedy", "Science Fiction"], "2024", 56, 72],
    [["Action", "Thriller", "Adventure"], "2025", 67, 72],
    [["Action", "Adventure", "Science Fiction"], "2013", 62, 70],
    [["Action", "Adventure", "Science Fiction"], "2012", 66, 69],
    [["Science Fiction", "Adventure", "Action"], "2025", 65, 68],
    [["Adventure", "Action", "Science Fiction"], "2010", 57, 67],
    [["Action", "Thriller", "Comedy", "Crime"], "2025", 59, 66],
    [["Action", "Adventure", "Drama"], "2024", 64, 66],
    [["Adventure", "Action", "Science Fiction"], "2002", 54, 63],
    [["Action", "Science Fiction", "Adventure"], "2023", 55, 63],
    [["Action", "Adventure", "Science Fiction"], "2007", 59, 62],
    [["Action", "Adventure", "Science Fiction"], "2014", 53, 60],
    [["Science Fiction", "Fantasy", "Action"], "2016", 52, 60],
    [["Action", "Adventure", "Science Fiction"], "2012", 51, 60],
    [["Action", "Science Fiction", "Adventure"], "2021", 45, 60],
    [["Action", "Adventure", "Science Fiction"], "2023", 48, 55],
    [["Science Fiction", "Action", "Adventure"], "2024", 41, 53],
    [["Action", "Thriller"], "2026", 40, 53],
    [["Science Fiction", "Action", "Adventure"], "2023", 31, 45],
    [["Action", "Adventure", "Thriller"], "2024", 35, 44],
  ];

  const realFacts = REAL.map(([genres, year, critic, score], i) =>
    fact({ id: `real-${i}`, title: `Real ${i}`, genres, year, critic, score, mediaType: "movie" }),
  );

  it("calls this person Opening Weekend, on 84 titles", () => {
    const p = profileOf(realFacts, watched);
    expect(p.total).toBe(84);
    expect(p.archetype?.key).toBe("popcorn");
    expect(p.archetype?.evidence).toBe("Action and adventure cover 95% of what you have watched.");
  });

  it("puts their four highest scores on the card", () => {
    const p = profileOf(realFacts, watched);
    expect(json(p.posters.map((x) => x.score))).toBe(json([89, 89, 89, 88]));
  });

  it("spreads them across the decades they actually watched", () => {
    const p = profileOf(realFacts, watched);
    expect(p.decadeCount).toBe(5);
    expect(p.decades[0].decade).toBe(2020);
  });
});
