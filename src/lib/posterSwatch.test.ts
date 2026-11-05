import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { decodeJpegBlockAverages } from "./posterColor";
import {
  SWATCHES,
  SWATCH_KEYS,
  asSwatchKey,
  posterSwatchFromPixels,
  snapToSwatch,
  type PosterSwatch,
} from "./posterSwatch";

/**
 * The fixtures are the real w92 posters TMDB serves for these titles, as
 * downloaded on 2026-11-05, so the thresholds are checked against the block
 * grid the nightly pass actually reads. Each expected swatch was checked by
 * eye against its poster: Alien is a black poster with a small green glow,
 * The Crown a grey portrait on black, The Sopranos red title type over a dark
 * room, Shawshank a gold rain-lit sky, Oppenheimer a dark red fire.
 */
function swatchOfFixture(name: string): PosterSwatch {
  const bytes = new Uint8Array(
    readFileSync(new URL(`./__fixtures__/posters/${name}.jpg`, import.meta.url)),
  );
  const img = decodeJpegBlockAverages(bytes);
  if (!img) throw new Error(`fixture ${name} did not decode`);
  const s = posterSwatchFromPixels(img.rgb, img.width, img.height);
  if (!s) throw new Error(`fixture ${name} gave no swatch`);
  return s;
}

describe("posterSwatch on real posters", () => {
  it("reads Alien as noir", () => {
    expect(swatchOfFixture("alien").swatch).toBe("noir");
  });
  it("reads The Crown as noir", () => {
    expect(swatchOfFixture("the-crown").swatch).toBe("noir");
  });
  it("reads The Sopranos as red", () => {
    expect(swatchOfFixture("the-sopranos").swatch).toBe("red");
  });
  it("reads The Shawshank Redemption as gold", () => {
    expect(swatchOfFixture("shawshank").swatch).toBe("gold");
  });
  it("reads Oppenheimer as wine", () => {
    expect(swatchOfFixture("oppenheimer").swatch).toBe("wine");
  });
  it("never gives a second swatch equal to the first", () => {
    for (const n of ["alien", "the-crown", "the-sopranos", "shawshank", "oppenheimer"]) {
      const s = swatchOfFixture(n);
      expect(s.swatchAlt).not.toBe(s.swatch);
    }
  });
});

function flat(r: number, g: number, b: number, w = 12, h = 18): Uint8Array {
  const out = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) out.set([r, g, b], i * 3);
  return out;
}

describe("posterSwatchFromPixels", () => {
  it("returns null for an empty grid", () => {
    expect(posterSwatchFromPixels(new Uint8Array(0), 0, 0)).toBeNull();
  });
  it("reads an all-grey or all-black poster as noir with no second swatch", () => {
    expect(posterSwatchFromPixels(flat(128, 128, 128), 12, 18)).toEqual({
      swatch: "noir",
      swatchAlt: null,
    });
    expect(posterSwatchFromPixels(flat(0, 0, 0), 12, 18)).toEqual({
      swatch: "noir",
      swatchAlt: null,
    });
  });
  it("snaps flat saturated posters to the nearest hue", () => {
    expect(posterSwatchFromPixels(flat(230, 40, 40), 12, 18)?.swatch).toBe("red");
    expect(posterSwatchFromPixels(flat(40, 90, 240), 12, 18)?.swatch).toBe("blue");
    expect(posterSwatchFromPixels(flat(40, 200, 90), 12, 18)?.swatch).toBe("green");
  });
  it("finds a second colour that holds enough of the poster", () => {
    const rgb = flat(230, 40, 40);
    // The bottom third turns blue.
    for (let i = 12 * 12; i < 12 * 18; i++) rgb.set([40, 90, 240], i * 3);
    expect(posterSwatchFromPixels(rgb, 12, 18)).toEqual({ swatch: "red", swatchAlt: "blue" });
  });
  it("is deterministic", () => {
    const rgb = flat(200, 120, 30);
    expect(posterSwatchFromPixels(rgb, 12, 18)).toEqual(posterSwatchFromPixels(rgb, 12, 18));
  });
});

describe("snapToSwatch", () => {
  it("sends dark colours to the dark swatches", () => {
    expect(snapToSwatch(110, 15, 20, 1)).toBe("wine");
    expect(snapToSwatch(110, 50, 15, 1)).toBe("rust");
    expect(snapToSwatch(15, 30, 100, 1)).toBe("navy");
  });
  it("sends a colourless poster to noir", () => {
    expect(snapToSwatch(230, 40, 40, 0.001)).toBe("noir");
  });
});

// WCAG relative luminance.
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe("the swatch table", () => {
  it("has the fourteen keys, each once, each with an entry", () => {
    expect(SWATCH_KEYS.length).toBe(14);
    expect(new Set(SWATCH_KEYS).size).toBe(14);
    for (const k of SWATCH_KEYS) expect(SWATCHES[k].key).toBe(k);
    expect(Object.keys(SWATCHES).sort()).toEqual([...SWATCH_KEYS].sort());
  });
  it("gives every fill an ink that clears 4.5:1 for body text", () => {
    for (const k of SWATCH_KEYS) {
      const { fill, ink } = SWATCHES[k];
      expect(contrast(fill, ink)).toBeGreaterThan(4.5);
    }
  });
  it("matches the database check constraint", () => {
    const sql = readFileSync(
      new URL("../../supabase/migrations/20261105223154_media_poster_swatch.sql", import.meta.url),
      "utf8",
    );
    const block = sql.match(/swatch is null or swatch in \(([^)]*)\)/);
    expect(block).not.toBeNull();
    const keys = [...(block?.[1] ?? "").matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect(keys).toEqual([...SWATCH_KEYS]);
  });
  it("narrows untrusted values", () => {
    expect(asSwatchKey("noir")).toBe("noir");
    expect(asSwatchKey("purple")).toBeNull();
    expect(asSwatchKey(null)).toBeNull();
  });
});
