import { describe, expect, it } from "bun:test";
import {
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
} from "./share";

describe("shareTaglines", () => {
  it("renders a clean sweep", () => {
    expect(shareTaglines({ matches: 5, clean: true })).toBe(
      "Tagline Roulette 5/5 clean\n🟩🟩🟩🟩🟩\nbalasaur.com/play/taglines",
    );
  });
  it("renders a partial board", () => {
    expect(shareTaglines({ matches: 3, clean: false })).toBe(
      "Tagline Roulette 3/5\n🟩🟩🟩🟥🟥\nbalasaur.com/play/taglines",
    );
  });
  it("drops the clean tag when the board was not clean", () => {
    expect(shareTaglines({ matches: 5, clean: false })).toBe(
      "Tagline Roulette 5/5\n🟩🟩🟩🟩🟩\nbalasaur.com/play/taglines",
    );
  });
});

describe("shareQuoteMatch", () => {
  it("renders a zero board", () => {
    expect(shareQuoteMatch({ matches: 0, clean: false })).toBe(
      "Quote Match 0/5\n🟥🟥🟥🟥🟥\nbalasaur.com/play/quote-match",
    );
  });
});

describe("shareCastingCall", () => {
  it("renders a short run", () => {
    expect(shareCastingCall({ streak: 4 })).toBe(
      "Casting Call 4 right\n🟩🟩🟩🟩\nbalasaur.com/play/casting-call",
    );
  });
  it("caps the grid at ten squares and counts the rest", () => {
    expect(shareCastingCall({ streak: 12 })).toBe(
      "Casting Call 12 right\n🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩 +2\nbalasaur.com/play/casting-call",
    );
  });
  it("renders zero as one red square", () => {
    expect(shareCastingCall({ streak: 0 })).toBe(
      "Casting Call 0 right\n🟥\nbalasaur.com/play/casting-call",
    );
  });
});

describe("shareLinkUp", () => {
  it("renders an under-par chain", () => {
    expect(shareLinkUp({ solved: true, steps: 3, par: 4 })).toBe(
      "Link Up: done in 3, par 4\n🟩🟩🟩\nbalasaur.com/play/link-up",
    );
  });
  it("colors over-par steps yellow", () => {
    expect(shareLinkUp({ solved: true, steps: 6, par: 4 })).toBe(
      "Link Up: done in 6, par 4\n🟩🟩🟩🟩🟨🟨\nbalasaur.com/play/link-up",
    );
  });
  it("renders an unsolved puzzle", () => {
    expect(shareLinkUp({ solved: false, steps: 2, par: 4 })).toBe(
      "Link Up X, par 4\n🟥\nbalasaur.com/play/link-up",
    );
  });
});

describe("shareTimeline", () => {
  it("renders per-slot results in order", () => {
    expect(shareTimeline({ slots: [true, false, true, true, false] })).toBe(
      "Timeline 3/5\n🟩🟥🟩🟩🟥\nbalasaur.com/play/timeline",
    );
  });
});

describe("shareScreening", () => {
  it("renders the day number and per-question results", () => {
    const answers = [true, true, false, true, true, true, false, true, true, true];
    expect(shareScreening({ day: 18, answers })).toBe(
      "The 8PM Screening #18 8/10\n🟩🟩🟥🟩🟩🟩🟥🟩🟩🟩\nbalasaur.com/play/screening",
    );
  });
});

describe("shareEmoji", () => {
  it("renders solved count over plots played", () => {
    expect(shareEmoji({ results: [true, true, false, true] })).toBe(
      "Emoji Plots 3/4\n🟩🟩🟥🟩\nbalasaur.com/play/emoji",
    );
  });
});

describe("shareSpeedSort", () => {
  it("renders a clean minute", () => {
    expect(shareSpeedSort({ day: 18, sorted: 8, missed: 0 })).toBe(
      "Speed Sort #18 8 in 60s\n🟩🟩🟩🟩🟩🟩🟩🟩\nbalasaur.com/play/speed-sort",
    );
  });
  it("names the misses and caps the grid", () => {
    expect(shareSpeedSort({ day: 18, sorted: 14, missed: 2 })).toBe(
      "Speed Sort #18 14 in 60s, 2 missed\n🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩 +4\nbalasaur.com/play/speed-sort",
    );
  });
});

describe("shareSequelOrFake", () => {
  it("renders a streak", () => {
    expect(shareSequelOrFake({ streak: 7 })).toBe(
      "Sequel or Fake 7 straight\n🟩🟩🟩🟩🟩🟩🟩\nbalasaur.com/play/sequel-or-fake",
    );
  });
});

describe("sharePosterReveal", () => {
  it("renders a win Balasaurdle-style", () => {
    expect(sharePosterReveal({ day: 18, guesses: 3, won: true })).toBe(
      "Poster Reveal #18 3/6\n🟥🟥🟩\nbalasaur.com/play/poster-reveal",
    );
  });
  it("renders a loss as a full red row", () => {
    expect(sharePosterReveal({ day: 18, guesses: 6, won: false })).toBe(
      "Poster Reveal #18 X/6\n🟥🟥🟥🟥🟥🟥\nbalasaur.com/play/poster-reveal",
    );
  });
  it("renders a first-guess win as one green square", () => {
    expect(sharePosterReveal({ day: 1, guesses: 1, won: true })).toBe(
      "Poster Reveal #1 1/6\n🟩\nbalasaur.com/play/poster-reveal",
    );
  });
});
