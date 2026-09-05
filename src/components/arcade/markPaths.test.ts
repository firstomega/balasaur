import { describe, expect, it } from "bun:test";
import { MARK_PATHS, MARK_VIEWBOX } from "./markPaths";

const SLUGS = [
  "balasaurdle",
  "quote-match",
  "taglines",
  "casting-call",
  "link-up",
  "timeline",
  "screening",
  "emoji",
  "speed-sort",
  "sequel-or-fake",
  "poster-reveal",
] as const;

// Path data: commands and numbers only, so Path2D and the SVG renderer
// both accept every string.
const PATH_SYNTAX = /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/;
const NUMBER = /-?\d*\.?\d+/g;

describe("MARK_PATHS", () => {
  it("has one mark per game, every mark at least two paths", () => {
    for (const slug of SLUGS) {
      expect(MARK_PATHS[slug].length).toBeGreaterThan(1);
    }
    expect(Object.keys(MARK_PATHS).sort().join(",")).toBe([...SLUGS].sort().join(","));
  });

  it("keeps every path in valid syntax inside the 24-unit box", () => {
    for (const slug of SLUGS) {
      for (const { d } of MARK_PATHS[slug]) {
        expect(PATH_SYNTAX.test(d)).toBe(true);
        expect(d).toStartWith("M");
        for (const n of d.match(NUMBER) ?? []) {
          expect(Math.abs(Number(n))).toBeLessThanOrEqual(MARK_VIEWBOX);
        }
      }
    }
  });
});
