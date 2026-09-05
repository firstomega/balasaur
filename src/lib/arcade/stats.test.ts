import { describe, expect, it } from "bun:test";
import {
  STATS_KEY,
  applyResult,
  bestLiveStreak,
  distribution,
  emptyStats,
  liveStreak,
  readAllStats,
  readStats,
  recordResult,
  winPercent,
} from "./stats";

// Minimal localStorage + window stand-in, as in consent.test.ts. Without it
// every storage function no-ops and the tests would pass while testing
// nothing.
const store = new Map<string, string>();
const fakeWindow = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
};

function setup() {
  store.clear();
  (globalThis as { window?: unknown }).window = fakeWindow;
  (globalThis as { CustomEvent?: unknown }).CustomEvent = class {
    constructor(public type: string) {}
  };
}

/** Deep equality through JSON; the repo's bun:test typings expose toBe only. */
function same(actual: unknown, expected: unknown) {
  expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
}

describe("applyResult", () => {
  it("starts a streak of one on the first play", () => {
    const s = applyResult(emptyStats(), 18, { won: true, bucket: 3 });
    same(s, { played: 1, wins: 1, streak: 1, best: 1, lastDay: 18, dist: { "3": 1 } });
  });
  it("extends the streak on the next day and restarts after a gap", () => {
    let s = applyResult(emptyStats(), 18, { won: true });
    s = applyResult(s, 19, { won: false, bucket: "X" });
    expect(s.streak).toBe(2);
    expect(s.best).toBe(2);
    expect(s.wins).toBe(1);
    s = applyResult(s, 21, { won: true });
    expect(s.streak).toBe(1);
    expect(s.best).toBe(2);
    expect(s.played).toBe(3);
  });
  it("is idempotent for the same day", () => {
    const first = applyResult(emptyStats(), 18, { won: true, bucket: 2 });
    const again = applyResult(first, 18, { won: false, bucket: "X" });
    expect(again).toBe(first);
    same(again.dist, { "2": 1 });
  });
  it("counts buckets across days", () => {
    let s = applyResult(emptyStats(), 1, { won: true, bucket: 3 });
    s = applyResult(s, 2, { won: true, bucket: 3 });
    s = applyResult(s, 3, { won: false, bucket: "X" });
    same(distribution(s, ["1", "2", "3", "4", "5", "6", "X"]), {
      buckets: [0, 0, 2, 0, 0, 0, 1],
      labels: ["1", "2", "3", "4", "5", "6", "X"],
    });
  });
});

describe("liveStreak and winPercent", () => {
  it("keeps the streak through today and yesterday, drops it after a missed day", () => {
    const s = { ...emptyStats(), streak: 5, lastDay: 18 };
    expect(liveStreak(s, 18)).toBe(5);
    expect(liveStreak(s, 19)).toBe(5);
    expect(liveStreak(s, 20)).toBe(0);
    expect(liveStreak(emptyStats(), 20)).toBe(0);
  });
  it("rounds the win rate to a whole percent", () => {
    expect(winPercent(emptyStats())).toBe(0);
    expect(winPercent({ ...emptyStats(), played: 3, wins: 2 })).toBe(67);
  });
});

describe("recordResult and readStats", () => {
  it("returns empty stats before anything is recorded", () => {
    setup();
    same(readStats("balasaurdle"), emptyStats());
    same(readAllStats(), {});
  });
  it("writes once per slug and day", () => {
    setup();
    recordResult("balasaurdle", 18, { won: true, bucket: 4 });
    recordResult("balasaurdle", 18, { won: false, bucket: "X" });
    const s = readStats("balasaurdle");
    expect(s.played).toBe(1);
    expect(s.wins).toBe(1);
    same(s.dist, { "4": 1 });
    expect(JSON.parse(store.get(STATS_KEY)!).balasaurdle.lastDay).toBe(18);
  });
  it("keeps games apart in one blob", () => {
    setup();
    recordResult("balasaurdle", 18, { won: true, bucket: 2 });
    recordResult("speed-sort", 18, { won: true, bucket: 21 });
    recordResult("speed-sort", 19, { won: true, bucket: 24 });
    expect(readStats("balasaurdle").streak).toBe(1);
    expect(readStats("speed-sort").streak).toBe(2);
    same(readStats("speed-sort").dist, { "21": 1, "24": 1 });
  });
  it("survives a corrupt blob", () => {
    setup();
    store.set(STATS_KEY, "{not json");
    same(readStats("emoji"), emptyStats());
    recordResult("emoji", 18, { won: true });
    expect(readStats("emoji").played).toBe(1);
  });
});

describe("bestLiveStreak", () => {
  it("picks the longest alive streak and says whether today kept it", () => {
    const blob = {
      balasaurdle: { ...emptyStats(), streak: 6, lastDay: 17 },
      "speed-sort": { ...emptyStats(), streak: 3, lastDay: 18 },
      emoji: { ...emptyStats(), streak: 9, lastDay: 10 },
    };
    same(bestLiveStreak(blob, 18), { slug: "balasaurdle", streak: 6, keptToday: false });
    same(bestLiveStreak(blob, 19), { slug: "speed-sort", streak: 3, keptToday: false });
    expect(bestLiveStreak(blob, 25)).toBe(null);
    expect(bestLiveStreak({}, 18)).toBe(null);
  });
  it("prefers the streak already kept today on a tie", () => {
    const blob = {
      timeline: { ...emptyStats(), streak: 4, lastDay: 17 },
      "link-up": { ...emptyStats(), streak: 4, lastDay: 18 },
    };
    same(bestLiveStreak(blob, 18), { slug: "link-up", streak: 4, keptToday: true });
  });
});
