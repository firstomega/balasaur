import { describe, expect, it } from "bun:test";
import {
  bestDecadeOf,
  franchiseKey,
  isWorkCredit,
  isWorkRole,
  median,
  pickTopCredits,
  rankedPool,
  PERSON_TOP_MIN_LED,
  PERSON_TOP_SIZE,
  type PersonCreditFacts,
} from "./personRanking";

/** Structural equality via JSON; the local bun:test shim has no toEqual. */
const json = (v: unknown) => JSON.stringify(v);

let seq = 0;

/** A catalog row that passes the shared trust rule unless told otherwise,
 *  named so the assertions below read like the page does. */
function credit(
  title: string,
  score: number | null,
  billed: string[],
  extra: Partial<PersonCreditFacts> & { role?: string } = {},
): PersonCreditFacts {
  const { role = "Cast", ...rest } = extra;
  return {
    media_id: `movie-${++seq}`,
    media_type: "movie",
    title,
    genres: ["Drama"],
    film_length_minutes: 110,
    vote_count: 5000,
    rating_imdb: 7.5,
    rating_rotten_tomatoes: 80,
    rating_metacritic: null,
    rating_tmdb: 7.4,
    rating_balasaur: score,
    release_date: "2010-01-01",
    year: "2010",
    popularity: 1,
    tmdb_collection_id: null,
    people: billed.map((name) => ({ name, role })),
    ...rest,
  };
}

/** Enough billed, scored titles to clear the ranking gate. */
function filler(name: string, count: number, score = 50) {
  return Array.from({ length: count }, (_, i) => credit(`Filler ${i}`, score, [name]));
}

const titles = (rows: PersonCreditFacts[]) => rows.map((r) => r.title);

describe("pickTopCredits", () => {
  it("orders by the score printed on the card, best first", () => {
    const rows = [
      credit("Middling", 62, ["Ann Lee"]),
      credit("Great", 91, ["Ann Lee"]),
      credit("Good", 78, ["Ann Lee"]),
      ...filler("Ann Lee", 5, 40),
    ];
    const top = pickTopCredits(rows, "Ann Lee");
    expect(json(titles(top).slice(0, 3))).toBe(json(["Great", "Good", "Middling"]));
  });

  it("leaves out a high-scoring title the person is not billed on", () => {
    // The cameo case: two minutes in a masterpiece should not outrank the
    // work they carried, and it stays on the page in the filmography anyway.
    const rows = [
      credit("Masterpiece They Walked Through", 97, ["Someone Else", "Another Name"]),
      credit("Their Best Lead", 84, ["Ann Lee"]),
      ...filler("Ann Lee", 7, 40),
    ];
    const top = pickTopCredits(rows, "Ann Lee");
    expect(titles(top)).not.toContain("Masterpiece They Walked Through");
    expect(top[0].title).toBe("Their Best Lead");
  });

  it("refuses to rank a pool too small to mean anything", () => {
    const rows = filler("Ann Lee", PERSON_TOP_MIN_LED - 1);
    expect(json(pickTopCredits(rows, "Ann Lee"))).toBe(json([]));
  });

  it("ranks once the pool reaches the gate", () => {
    const rows = filler("Ann Lee", PERSON_TOP_MIN_LED);
    expect(pickTopCredits(rows, "Ann Lee").length).toBe(PERSON_TOP_SIZE);
  });

  it("ignores unscored titles when counting the pool", () => {
    const rows = [
      ...filler("Ann Lee", PERSON_TOP_MIN_LED - 1),
      credit("No score yet", null, ["Ann Lee"]),
    ];
    expect(json(pickTopCredits(rows, "Ann Lee"))).toBe(json([]));
  });

  it("breaks a tie on popularity, where the scores claim nothing", () => {
    const rows = [
      credit("Quiet", 80, ["Ann Lee"], { popularity: 2 }),
      credit("Loud", 80, ["Ann Lee"], { popularity: 900 }),
      ...filler("Ann Lee", 6, 40),
    ];
    expect(pickTopCredits(rows, "Ann Lee")[0].title).toBe("Loud");
  });

  // The 2026-10-15 defects, by name.
  it("keeps the shared trust rule's exclusions out of the six", () => {
    const rows = [
      credit("Toy Story of Terror!", 99, ["Tom Hanks"], { film_length_minutes: 22 }),
      credit("A Thin Score", 98, ["Tom Hanks"], { vote_count: 12 }),
      credit("One Source", 97, ["Tom Hanks"], {
        rating_imdb: null,
        rating_rotten_tomatoes: null,
        vote_count: 200,
      }),
      credit("Late Night Chat", 96, ["Tom Hanks"], { media_type: "tv", genres: ["Talk"] }),
      credit("Big - Official Trailer", 95, ["Tom Hanks"]),
      credit("Forrest Gump", 84, ["Tom Hanks"], { role: "Forrest Gump" }),
      ...filler("Tom Hanks", 8, 40),
    ];
    expect(pickTopCredits(rows, "Tom Hanks")[0].title).toBe("Forrest Gump");
  });

  it("drops hosting, narrating and documentaries about the person", () => {
    const rows = [
      credit("From the Earth to the Moon", 85, ["Tom Hanks"], { media_type: "tv", role: "Host" }),
      credit("The National Parks", 84, ["Tom Hanks"], {
        media_type: "tv",
        genres: ["Documentary"],
        role: "Cast",
      }),
      credit("Mr. Scorsese", 85, ["Tom Hanks"], { genres: ["Documentary"], role: "Self" }),
      credit("World War II with Tom Hanks", 82, ["Tom Hanks"], { role: "Self - Presenter" }),
      credit("Forrest Gump", 84, ["Tom Hanks"], { role: "Forrest Gump" }),
      ...filler("Tom Hanks", 8, 40),
    ];
    const top = titles(pickTopCredits(rows, "Tom Hanks"));
    expect(top[0]).toBe("Forrest Gump");
    for (const gone of [
      "From the Earth to the Moon",
      "The National Parks",
      "Mr. Scorsese",
      "World War II with Tom Hanks",
    ]) {
      expect(top).not.toContain(gone);
    }
  });

  it("keeps a documentary the person directed", () => {
    const rows = [
      credit("The Last Waltz", 85, ["Martin Scorsese"], {
        genres: ["Documentary", "Music"],
        role: "Director",
      }),
      ...filler("Martin Scorsese", 8, 40),
    ];
    expect(pickTopCredits(rows, "Martin Scorsese")[0].title).toBe("The Last Waltz");
  });

  it("holds one place per franchise, for its best entry", () => {
    const rows = [
      credit("Toy Story", 89, ["Tom Hanks"], { tmdb_collection_id: 10194 }),
      credit("Saving Private Ryan", 88, ["Tom Hanks"]),
      credit("Toy Story 3", 87, ["Tom Hanks"], { tmdb_collection_id: 10194 }),
      credit("Toy Story 2", 85, ["Tom Hanks"], { tmdb_collection_id: 10194 }),
      credit("Forrest Gump", 84, ["Tom Hanks"]),
      ...filler("Tom Hanks", 8, 40),
    ];
    const top = titles(pickTopCredits(rows, "Tom Hanks"));
    expect(json(top.slice(0, 3))).toBe(json(["Toy Story", "Saving Private Ryan", "Forrest Gump"]));
    expect(top.filter((t) => t.startsWith("Toy Story")).length).toBe(1);
  });

  it("counts the gate after the franchise cap", () => {
    const rows = [
      ...Array.from({ length: 4 }, (_, i) =>
        credit(`Sequel ${i}`, 80, ["Ann Lee"], { tmdb_collection_id: 7 }),
      ),
      ...filler("Ann Lee", PERSON_TOP_MIN_LED - 2),
    ];
    // Ten rows, but only seven distinct franchises.
    expect(json(pickTopCredits(rows, "Ann Lee"))).toBe(json([]));
  });
});

describe("isWorkRole", () => {
  it("rejects the live role values for appearing as oneself, hosting and narrating", () => {
    for (const role of [
      "Self",
      "self",
      "Himself",
      "Herself - Host",
      "Self - Narrator (voice)",
      "Self (archive footage)",
      "Self- Team Captain",
      "Themself",
      "(archive footage)",
      "Host",
      "Main Host",
      "Presenter",
      "Narrator (voice)",
      "Narration (Voice)",
    ]) {
      expect(isWorkRole(role, false)).toBe(false);
    }
  });

  it("keeps parts that merely contain those words", () => {
    // Fight Club: Edward Norton's role is "Narrator". Voice parts are work.
    for (const role of [
      "Narrator",
      "Woody (voice)",
      "Selfridge",
      "Host Family Father",
      "The Host",
      "Mayor / Snake / Lil' Arturo / Narrator (voice)",
      "The Stig",
      "Cast",
    ]) {
      expect(isWorkRole(role, false)).toBe(true);
    }
  });

  it("treats a documentary's narrator and unnamed cast slot as not a performance", () => {
    expect(isWorkRole("Narrator", true)).toBe(false);
    expect(isWorkRole("Narrateur", true)).toBe(false);
    expect(isWorkRole("Cast", true)).toBe(false);
    expect(isWorkRole("", true)).toBe(false);
    expect(isWorkRole("Winston Churchill", true)).toBe(true);
    expect(isWorkRole("Director", true)).toBe(true);
  });
});

describe("isWorkCredit", () => {
  it("matches a billed name regardless of case", () => {
    expect(isWorkCredit(credit("X", 70, ["ANN LEE"]), "Ann Lee")).toBe(true);
    expect(isWorkCredit(credit("X", 70, ["Ann Leigh"]), "Ann Lee")).toBe(false);
  });
});

describe("franchiseKey", () => {
  it("uses the collection id for movies and the title stem for shows", () => {
    expect(franchiseKey({ tmdb_collection_id: 10194, title: "Toy Story 3" })).toBe("c:10194");
    expect(franchiseKey({ tmdb_collection_id: null, title: "Adventure Time" })).toBe(
      franchiseKey({ tmdb_collection_id: null, title: "Adventure Time: Distant Lands" }),
    );
    expect(franchiseKey({ tmdb_collection_id: null, title: "Breaking Bad" })).not.toBe(
      franchiseKey({ tmdb_collection_id: null, title: "Better Call Saul" }),
    );
  });
});

describe("bestDecadeOf", () => {
  const inYear = (title: string, score: number, year: number) =>
    credit(title, score, ["Ann Lee"], { release_date: `${year}-01-01`, year: String(year) });

  it("names the best decade and the one it beat", () => {
    const rows = [
      ...[88, 86, 84].map((s, i) => inYear(`N${i}`, s, 1995)),
      ...[60, 62, 64].map((s, i) => inYear(`T${i}`, s, 2021)),
    ];
    expect(json(bestDecadeOf(rows))).toBe(
      json({
        decade: "1990s",
        median: 86,
        titles: 3,
        runnerUp: { decade: "2020s", median: 62, titles: 3 },
      }),
    );
  });

  it("says nothing with one qualifying decade, or a tie at the top", () => {
    const one = [70, 72, 74].map((s, i) => inYear(`A${i}`, s, 1995));
    expect(bestDecadeOf(one)).toBeUndefined();
    const tie = [...one, ...[70, 72, 74].map((s, i) => inYear(`B${i}`, s, 2005))];
    expect(bestDecadeOf(tie)).toBeUndefined();
  });

  it("is computed over the ranked pool, so an untrusted score never moves it", () => {
    const rows = [
      ...[70, 72, 74].map((s, i) => inYear(`A${i}`, s, 1995)),
      ...[60, 62, 64].map((s, i) => inYear(`B${i}`, s, 2005)),
      ...[99, 99, 99].map((s, i) => ({ ...inYear(`Thin${i}`, s, 2015), vote_count: 4 })),
    ];
    expect(bestDecadeOf(rankedPool(rows, "Ann Lee"))?.decade).toBe("1990s");
  });
});

describe("median", () => {
  it("returns the middle value, and the rounded mean of the middle pair", () => {
    expect(median([70])).toBe(70);
    expect(median([60, 70, 80])).toBe(70);
    expect(median([60, 71])).toBe(66);
    expect(median([])).toBeUndefined();
  });
});
