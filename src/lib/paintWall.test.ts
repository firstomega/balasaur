import { describe, expect, it } from "bun:test";
import { paintTiles } from "./paintWall";
import { PAPER_SURFACE, swatchSurface } from "./swatchSurface";
import { SWATCH_KEYS } from "./posterSwatch";

describe("paintTiles", () => {
  it("paints each tile in its leader's swatch", () => {
    expect(
      paintTiles([
        { swatch: "navy", swatchAlt: null },
        { swatch: "lime", swatchAlt: "gold" },
        { swatch: "noir", swatchAlt: null },
      ]),
    ).toEqual(["navy", "lime", "noir"]);
  });

  it("takes the second swatch when the tile before has the same colour", () => {
    // Psycho leads both Peacock and Netflix movies: the second tile must not
    // repeat the first.
    expect(
      paintTiles([
        { swatch: "navy", swatchAlt: "red" },
        { swatch: "navy", swatchAlt: "red" },
        { swatch: "navy", swatchAlt: "red" },
      ]),
    ).toEqual(["navy", "red", "navy"]);
  });

  it("compares against the colour the previous tile was painted, not its first swatch", () => {
    expect(
      paintTiles([
        { swatch: "gold", swatchAlt: "sky" },
        { swatch: "gold", swatchAlt: "sky" },
        { swatch: "sky", swatchAlt: "pink" },
      ]),
    ).toEqual(["gold", "sky", "pink"]);
  });

  it("puts a repeat with no second swatch on paper, which breaks the run", () => {
    expect(
      paintTiles([
        { swatch: "noir", swatchAlt: null },
        { swatch: "noir", swatchAlt: null },
        { swatch: "noir", swatchAlt: null },
      ]),
    ).toEqual(["noir", null, "noir"]);
  });

  it("gives a leader with no swatch, or no leader, the paper tile", () => {
    expect(paintTiles([{ swatch: null, swatchAlt: "red" }, null, undefined])).toEqual([
      null,
      null,
      null,
    ]);
  });

  it("does not treat two paper tiles as a repeat to fix", () => {
    expect(paintTiles([null, { swatch: null, swatchAlt: null }])).toEqual([null, null]);
  });

  it("is the same for the same input, with no width or randomness", () => {
    const leads = [
      { swatch: "red", swatchAlt: "blue" },
      { swatch: "red", swatchAlt: "blue" },
    ] as const;
    expect(paintTiles(leads)).toEqual(paintTiles(leads));
  });

  it("handles an empty wall", () => {
    expect(paintTiles([])).toEqual([]);
  });
});

describe("swatchSurface", () => {
  it("names a fill and its own ink for every swatch", () => {
    for (const k of SWATCH_KEYS) {
      expect(swatchSurface(k)).toBe(`bg-swatch-${k} text-swatch-${k}-ink`);
    }
  });

  it("falls back to the paper surface", () => {
    expect(swatchSurface(null)).toBe(PAPER_SURFACE);
    expect(swatchSurface(undefined)).toBe(PAPER_SURFACE);
  });
});
