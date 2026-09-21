import { describe, expect, it } from "bun:test";
import {
  bestDecadeOf,
  collaboratorsOf,
  isBilledOn,
  median,
  pickTopCredits,
  PERSON_TOP_MIN_LED,
  PERSON_TOP_SIZE,
  type PersonCreditFacts,
} from "./personRanking";

/** Structural equality via JSON; the local bun:test shim has no toEqual. */
const json = (v: unknown) => JSON.stringify(v);

/** A catalog row, named so the assertions below read like the page does. */
function credit(
  title: string,
  score: number | null,
  billed: string[],
  extra: Partial<PersonCreditFacts> = {},
): PersonCreditFacts & { title: string } {
  return {
    title,
    rating_balasaur: score,
    release_date: "2010-01-01",
    year: "2010",
    popularity: 1,
    people: billed.map((name) => ({ name, role: "Cast" })),
    ...extra,
  };
}

/** Enough billed, scored titles to clear the ranking gate. */
function filler(name: string, count: number, score = 50) {
  return Array.from({ length: count }, (_, i) => credit(`Filler ${i}`, score, [name]));
}

describe("pickTopCredits", () => {
  it("orders by the score printed on the card, best first", () => {
    const rows = [
      credit("Middling", 62, ["Ann Lee"]),
      credit("Great", 91, ["Ann Lee"]),
      credit("Good", 78, ["Ann Lee"]),
      ...filler("Ann Lee", 5, 40),
    ];
    const top = pickTopCredits(rows, "Ann Lee");
    expect(json(top.map((r) => r.title).slice(0, 3))).toBe(json(["Great", "Good", "Middling"]));
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
    expect(top.map((r) => r.title)).not.toContain("Masterpiece They Walked Through");
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

  it("matches a billed name regardless of case", () => {
    expect(isBilledOn(credit("X", 70, ["ANN LEE"]), "Ann Lee")).toBe(true);
    expect(isBilledOn(credit("X", 70, ["Ann Leigh"]), "Ann Lee")).toBe(false);
  });
});

describe("collaboratorsOf", () => {
  it("counts a collaborator once per title and never counts the person", () => {
    const rows = [
      credit("A", 70, ["Ann Lee", "Bo Chen", "Bo Chen"]),
      credit("B", 70, ["Ann Lee", "Bo Chen"]),
      credit("C", 70, ["Ann Lee", "Bo Chen"]),
    ];
    expect(json(collaboratorsOf(rows, "Ann Lee"))).toBe(json([{ name: "Bo Chen", together: 3 }]));
  });

  it("stays quiet about a pairing that happened twice", () => {
    const rows = [credit("A", 70, ["Ann Lee", "Bo Chen"]), credit("B", 70, ["Ann Lee", "Bo Chen"])];
    expect(json(collaboratorsOf(rows, "Ann Lee"))).toBe(json([]));
  });
});

describe("bestDecadeOf", () => {
  it("names the decade with the highest median", () => {
    const nineties = Array.from({ length: 3 }, () =>
      credit("N", 88, [], { release_date: "1995-01-01", year: "1995" }),
    );
    const twenties = Array.from({ length: 3 }, () =>
      credit("T", 60, [], { release_date: "2021-01-01", year: "2021" }),
    );
    expect(json(bestDecadeOf([...nineties, ...twenties]))).toBe(
      json({ bestDecade: "1990s", bestDecadeMedian: 88, bestDecadeTitles: 3 }),
    );
  });

  it("says nothing when no decade carries enough titles", () => {
    const rows = [
      credit("A", 90, [], { release_date: "1995-01-01", year: "1995" }),
      credit("B", 90, [], { release_date: "2005-01-01", year: "2005" }),
    ];
    expect(json(bestDecadeOf(rows))).toBe(json({}));
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
