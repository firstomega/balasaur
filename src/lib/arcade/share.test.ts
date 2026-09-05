import { describe, expect, it } from "bun:test";
import {
  SHARE_GLYPH,
  shareBalasaurdle,
  shareCastingCall,
  shareEmoji,
  shareLinkUp,
  sharePosterReveal,
  shareQuoteMatch,
  shareScreening,
  shareSequelOrFake,
  shareSpeedSort,
  shareTaglines,
  shareTimeline,
  squares,
} from "./share";
import { GAMES } from "./games";
import type { GameSlug } from "./types";

describe("SHARE_GLYPH", () => {
  it("has one glyph for every game in the registry", () => {
    for (const slug of Object.keys(GAMES) as GameSlug[]) {
      expect(SHARE_GLYPH[slug].length).toBeGreaterThan(0);
    }
    expect(new Set(Object.values(SHARE_GLYPH)).size).toBe(Object.keys(GAMES).length);
  });
});

describe("squares", () => {
  it("renders results in order and pads unused slots", () => {
    expect(squares([true, false, true])).toBe("🟩🟥🟩");
    expect(squares([true, false], 5)).toBe("🟩🟥⬛⬛⬛");
    expect(squares([], 3)).toBe("⬛⬛⬛");
  });
});

describe("shareBalasaurdle", () => {
  it("renders a third-guess solve with the room left", () => {
    expect(shareBalasaurdle({ day: 18, guesses: 3, won: true })).toBe(
      "🎬 Balasaurdle #18 3/6\n🟥🟥🟩⬛⬛⬛\nbalasaur.com/play/balasaurdle",
    );
  });
  it("names the hints", () => {
    expect(shareBalasaurdle({ day: 18, guesses: 5, won: true, hints: 2 })).toBe(
      "🎬 Balasaurdle #18 5/6 (2 hints)\n🟥🟥🟥🟥🟩⬛\nbalasaur.com/play/balasaurdle",
    );
    expect(shareBalasaurdle({ day: 18, guesses: 1, won: true, hints: 1 })).toBe(
      "🎬 Balasaurdle #18 1/6 (1 hint)\n🟩⬛⬛⬛⬛⬛\nbalasaur.com/play/balasaurdle",
    );
  });
  it("renders a loss as a full red row", () => {
    expect(shareBalasaurdle({ day: 18, guesses: 6, won: false })).toBe(
      "🎬 Balasaurdle #18 X/6\n🟥🟥🟥🟥🟥🟥\nbalasaur.com/play/balasaurdle",
    );
  });
});

describe("sharePosterReveal", () => {
  it("renders a win Balasaurdle-style", () => {
    expect(sharePosterReveal({ day: 18, guesses: 3, won: true })).toBe(
      "🖼️ Poster Reveal #18 3/6\n🟥🟥🟩⬛⬛⬛\nbalasaur.com/play/poster-reveal",
    );
  });
  it("renders a loss as a full red row", () => {
    expect(sharePosterReveal({ day: 18, guesses: 6, won: false })).toBe(
      "🖼️ Poster Reveal #18 X/6\n🟥🟥🟥🟥🟥🟥\nbalasaur.com/play/poster-reveal",
    );
  });
  it("renders a first-guess win as one green square", () => {
    expect(sharePosterReveal({ day: 1, guesses: 1, won: true })).toBe(
      "🖼️ Poster Reveal #1 1/6\n🟩⬛⬛⬛⬛⬛\nbalasaur.com/play/poster-reveal",
    );
  });
});

describe("shareQuoteMatch", () => {
  it("renders a zero board", () => {
    expect(shareQuoteMatch({ day: 18, matches: 0, clean: false })).toBe(
      "💬 Quote Match #18 0/5\n🟥🟥🟥🟥🟥\nbalasaur.com/play/quote-match",
    );
  });
  it("renders a clean sweep", () => {
    expect(shareQuoteMatch({ day: 18, matches: 5, clean: true })).toBe(
      "💬 Quote Match #18 5/5 clean\n🟩🟩🟩🟩🟩\nbalasaur.com/play/quote-match",
    );
  });
});

describe("shareTaglines", () => {
  it("renders a clean sweep", () => {
    expect(shareTaglines({ day: 18, matches: 5, clean: true })).toBe(
      "🎞️ Tagline Roulette #18 5/5 clean\n🟩🟩🟩🟩🟩\nbalasaur.com/play/taglines",
    );
  });
  it("renders a partial board", () => {
    expect(shareTaglines({ day: 18, matches: 3, clean: false })).toBe(
      "🎞️ Tagline Roulette #18 3/5\n🟩🟩🟩🟥🟥\nbalasaur.com/play/taglines",
    );
  });
  it("drops the clean tag when the board was not clean", () => {
    expect(shareTaglines({ day: 18, matches: 5, clean: false })).toBe(
      "🎞️ Tagline Roulette #18 5/5\n🟩🟩🟩🟩🟩\nbalasaur.com/play/taglines",
    );
  });
});

describe("shareCastingCall", () => {
  it("shows where the misses happened", () => {
    expect(
      shareCastingCall({ day: 18, results: [true, true, false, true, true, true, false, true] }),
    ).toBe("🎭 Casting Call #18 6/8\n🟩🟩🟥🟩🟩🟩🟥🟩\nbalasaur.com/play/casting-call");
  });
  it("renders a shutout", () => {
    expect(shareCastingCall({ day: 18, results: [false, false, false, false] })).toBe(
      "🎭 Casting Call #18 0/4\n🟥🟥🟥🟥\nbalasaur.com/play/casting-call",
    );
  });
});

describe("shareLinkUp", () => {
  it("renders an under-par chain", () => {
    expect(shareLinkUp({ day: 18, solved: true, steps: 3, par: 4 })).toBe(
      "🔗 Link Up #18 done in 3, par 4\n🟩🟩🟩\nbalasaur.com/play/link-up",
    );
  });
  it("colors over-par steps yellow", () => {
    expect(shareLinkUp({ day: 18, solved: true, steps: 6, par: 4 })).toBe(
      "🔗 Link Up #18 done in 6, par 4\n🟩🟩🟩🟩🟨🟨\nbalasaur.com/play/link-up",
    );
  });
  it("renders an unsolved puzzle", () => {
    expect(shareLinkUp({ day: 18, solved: false, steps: 2, par: 4 })).toBe(
      "🔗 Link Up #18 X, par 4\n🟥\nbalasaur.com/play/link-up",
    );
  });
});

describe("shareTimeline", () => {
  it("renders per-slot results in order", () => {
    expect(shareTimeline({ day: 18, slots: [true, false, true, true, false] })).toBe(
      "📅 Timeline #18 3/5\n🟩🟥🟩🟩🟥\nbalasaur.com/play/timeline",
    );
  });
});

describe("shareScreening", () => {
  it("renders the day number and per-question results", () => {
    const answers = [true, true, false, true, true, true, false, true, true, true];
    expect(shareScreening({ day: 18, answers })).toBe(
      "🎟️ The 8PM Screening #18 8/10\n🟩🟩🟥🟩🟩🟩🟥🟩🟩🟩\nbalasaur.com/play/screening",
    );
  });
  it("pads a walk-out with unused squares", () => {
    expect(shareScreening({ day: 18, answers: [true, false] })).toBe(
      "🎟️ The 8PM Screening #18 1/10\n🟩🟥⬛⬛⬛⬛⬛⬛⬛⬛\nbalasaur.com/play/screening",
    );
  });
});

describe("shareEmoji", () => {
  it("renders solved count over plots played", () => {
    expect(shareEmoji({ day: 18, results: [true, true, false, true, false] })).toBe(
      "🍿 Emoji Plots #18 3/5\n🟩🟩🟥🟩🟥\nbalasaur.com/play/emoji",
    );
  });
});

describe("shareSpeedSort", () => {
  it("renders a clean minute", () => {
    expect(shareSpeedSort({ day: 18, sorted: 8, missed: 0 })).toBe(
      "⏱️ Speed Sort #18 8 in 60s\n🟩🟩🟩🟩🟩🟩🟩🟩\nbalasaur.com/play/speed-sort",
    );
  });
  it("names the misses and caps the grid", () => {
    expect(shareSpeedSort({ day: 18, sorted: 14, missed: 2 })).toBe(
      "⏱️ Speed Sort #18 14 in 60s, 2 missed\n🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩 +4\nbalasaur.com/play/speed-sort",
    );
  });
  it("renders zero as one red square", () => {
    expect(shareSpeedSort({ day: 18, sorted: 0, missed: 3 })).toBe(
      "⏱️ Speed Sort #18 0 in 60s, 3 missed\n🟥\nbalasaur.com/play/speed-sort",
    );
  });
});

describe("shareSequelOrFake", () => {
  it("renders ten calls in order", () => {
    const results = [true, true, true, true, true, true, true, false, false, true];
    expect(shareSequelOrFake({ day: 18, results })).toBe(
      "🎲 Sequel or Fake #18 8/10\n🟩🟩🟩🟩🟩🟩🟩🟥🟥🟩\nbalasaur.com/play/sequel-or-fake",
    );
  });
});
