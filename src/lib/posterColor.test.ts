import { describe, expect, it } from "bun:test";
import {
  decodeJpegBlockAverages,
  hexFromRgb,
  posterColorsFromJpeg,
  posterColorsFromPixels,
} from "./posterColor";

/**
 * The fixtures at the bottom are one synthetic poster (teal sky, orange sun,
 * dark foreground, pale title bar) encoded six ways by an outside encoder, so
 * the decoder is checked against files it did not produce. SAMPLE_BLOCKS holds
 * that poster's true 8x8 block averages, measured on the source bitmap before
 * encoding: "close" here means close to the picture, not close to this
 * decoder's own output.
 */
const SAMPLE_BLOCKS: { bx: number; by: number; rgb: [number, number, number] }[] = [
  { bx: 1, by: 1, rgb: [9, 42, 54] },
  { bx: 3, by: 6, rgb: [14, 50, 61] },
  { bx: 9, by: 4, rgb: [232, 140, 46] },
  { bx: 1, by: 13, rgb: [12, 12, 14] },
  { bx: 5, by: 16, rgb: [12, 12, 14] },
  { bx: 10, by: 17, rgb: [12, 12, 14] },
];

function bytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decoded(b64: string): { width: number; height: number; rgb: Uint8Array } {
  const img = decodeJpegBlockAverages(bytes(b64));
  if (!img) throw new Error("expected the fixture to decode");
  return img;
}

function blockAt(img: { width: number; rgb: Uint8Array }, bx: number, by: number): number[] {
  const o = (by * img.width + bx) * 3;
  return [img.rgb[o], img.rgb[o + 1], img.rgb[o + 2]];
}

/** How far the decoded blocks sit from the picture they came from. */
function worstSampleError(img: { width: number; rgb: Uint8Array }): number {
  let worst = 0;
  for (const s of SAMPLE_BLOCKS) {
    const got = blockAt(img, s.bx, s.by);
    for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(got[c] - s.rgb[c]));
  }
  return worst;
}

const isHex = (s: string) => /^#[0-9a-f]{6}$/.test(s);
const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);

function colorsOf(b64: string) {
  const c = posterColorsFromJpeg(bytes(b64));
  if (!c) throw new Error("expected colors");
  return c;
}

describe("decodeJpegBlockAverages", () => {
  it("reads a 4:2:0 poster as one pixel per 8x8 block", () => {
    const img = decoded(J420);
    expect(img.width).toBe(12);
    expect(img.height).toBe(18);
    // 4:2:0 stores color at half resolution, so a block on the sun's edge
    // borrows its neighbour's color. These samples are interior blocks.
    expect(worstSampleError(img)).toBeLessThanOrEqual(12);
  });

  it("is near-exact when the file keeps full color detail (4:4:4)", () => {
    expect(worstSampleError(decoded(J444))).toBeLessThanOrEqual(6);
  });

  it("resyncs on restart markers", () => {
    const withRestarts = decoded(RESTART);
    const plain = decoded(J420);
    expect(withRestarts.rgb.join(",")).toBe(plain.rgb.join(","));
  });

  it("reads a grayscale poster", () => {
    const img = decoded(GRAY);
    expect(img.width).toBe(12);
    const sun = blockAt(img, 9, 4);
    const sky = blockAt(img, 1, 1);
    expect(sun[0]).toBe(sun[2]);
    expect(sun[0]).toBeGreaterThan(sky[0]);
  });

  it("handles a size that is not a whole number of blocks (92x138)", () => {
    const img = decoded(J92);
    expect(img.width).toBe(12);
    expect(img.height).toBe(18);
    const sky = blockAt(img, 1, 1);
    expect(sky[2]).toBeGreaterThan(sky[0]);
  });

  it("refuses progressive JPEG rather than guessing", () => {
    expect(decodeJpegBlockAverages(bytes(PROGRESSIVE))).toBe(null);
  });

  it("returns null for bytes that are not a JPEG", () => {
    expect(decodeJpegBlockAverages(new Uint8Array(0))).toBe(null);
    expect(decodeJpegBlockAverages(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(null);
    expect(decodeJpegBlockAverages(new Uint8Array(64).fill(0xff))).toBe(null);
  });

  it("survives a truncated file", () => {
    const full = bytes(J420);
    for (const cut of [8, 100, 400, 1200]) {
      let threw = false;
      try {
        decodeJpegBlockAverages(full.slice(0, cut));
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    }
  });
});

describe("posterColorsFromJpeg", () => {
  it("finds the sky and the sun of the test poster", () => {
    const { colorA, colorB } = colorsOf(J420);
    expect(isHex(colorA)).toBe(true);
    expect(isHex(colorB)).toBe(true);
    // The teal sky leads on blue, the orange sun leads on red.
    expect(channel(colorA, 2)).toBeGreaterThan(channel(colorA, 0));
    expect(channel(colorB, 0)).toBeGreaterThan(channel(colorB, 2));
  });

  it("gives the same answer every time", () => {
    const first = colorsOf(J420);
    const second = colorsOf(J420);
    expect(first.colorA).toBe(second.colorA);
    expect(first.colorB).toBe(second.colorB);
  });

  it("agrees across encodings of the same poster", () => {
    // Within one hue step (30 degrees) of each other; the encodings differ, the
    // poster does not.
    const a = colorsOf(J420).colorA;
    const b = colorsOf(J444).colorA;
    expect(Math.abs(channel(a, 0) - channel(b, 0))).toBeLessThan(24);
    expect(Math.abs(channel(a, 2) - channel(b, 2))).toBeLessThan(24);
  });

  it("returns null for an all-black poster", () => {
    expect(posterColorsFromJpeg(bytes(BLACK))).toBe(null);
  });

  it("keeps a grayscale poster gray instead of inventing a hue", () => {
    const { colorA } = colorsOf(GRAY);
    const channels = [channel(colorA, 0), channel(colorA, 1), channel(colorA, 2)];
    expect(Math.max(...channels) - Math.min(...channels)).toBeLessThan(25);
  });
});

describe("posterColorsFromPixels", () => {
  const grid = (colors: [number, number, number][]): Uint8Array => {
    const out = new Uint8Array(colors.length * 3);
    colors.forEach((c, i) => {
      out[i * 3] = c[0];
      out[i * 3 + 1] = c[1];
      out[i * 3 + 2] = c[2];
    });
    return out;
  };

  function pick(pixels: [number, number, number][]) {
    return posterColorsFromPixels(grid(pixels), pixels.length, 1);
  }

  it("picks the dominant color first and a different hue second", () => {
    const pixels: [number, number, number][] = [];
    for (let i = 0; i < 70; i++) pixels.push([20, 90, 120]);
    for (let i = 0; i < 30; i++) pixels.push([200, 90, 30]);
    const colors = pick(pixels);
    if (!colors) throw new Error("expected colors");
    expect(channel(colors.colorA, 2)).toBeGreaterThan(channel(colors.colorA, 0));
    expect(channel(colors.colorB, 0)).toBeGreaterThan(channel(colors.colorB, 2));
  });

  it("ignores letterbox black and blown white", () => {
    const pixels: [number, number, number][] = [];
    for (let i = 0; i < 80; i++) pixels.push([2, 2, 2]);
    for (let i = 0; i < 10; i++) pixels.push([255, 255, 255]);
    for (let i = 0; i < 10; i++) pixels.push([180, 40, 40]);
    const colors = pick(pixels);
    if (!colors) throw new Error("expected colors");
    expect(channel(colors.colorA, 0)).toBeGreaterThan(channel(colors.colorA, 1));
  });

  it("returns null when every pixel is out of range", () => {
    expect(
      pick([
        [0, 0, 0],
        [1, 1, 1],
      ]),
    ).toBe(null);
    expect(posterColorsFromPixels(new Uint8Array(0), 0, 0)).toBe(null);
  });

  it("still returns two colors for a one-color poster", () => {
    const pixels: [number, number, number][] = [];
    for (let i = 0; i < 50; i++) pixels.push([160, 40, 60]);
    const colors = pick(pixels);
    if (!colors) throw new Error("expected colors");
    expect(isHex(colors.colorA)).toBe(true);
    expect(isHex(colors.colorB)).toBe(true);
    expect(colors.colorA === colors.colorB).toBe(false);
  });

  it("lifts a color dark enough to vanish into the range a glow can use", () => {
    const pixels: [number, number, number][] = [];
    for (let i = 0; i < 40; i++) pixels.push([18, 6, 30]);
    const colors = pick(pixels);
    if (!colors) throw new Error("expected colors");
    const brightest = Math.max(
      channel(colors.colorA, 0),
      channel(colors.colorA, 1),
      channel(colors.colorA, 2),
    );
    expect(brightest).toBeGreaterThan(100);
  });
});

describe("hexFromRgb", () => {
  it("writes the lowercase six-digit form the database accepts", () => {
    expect(hexFromRgb(0, 0, 0)).toBe("#000000");
    expect(hexFromRgb(255, 171, 8)).toBe("#ffab08");
    expect(hexFromRgb(-5, 300, 12.6)).toBe("#00ff0c");
  });
});

// --------------------------------------------------------------------- fixtures

const J420 =
  "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";

const J444 =
  "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";

const RESTART =
  "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";

const GRAY =
  "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";

const J92 =
  "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";

const PROGRESSIVE =
  "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";

const BLACK =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCACQAGADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD5UooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD//Z";
