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

/**
 * Real w92 posters TMDB serves as progressive JPEG, each beside a baseline twin
 * of the same pixels (ImageMagick: `convert in.jpg -interlace none out.jpg`).
 * The twin is a second lossy encode, so "close" allows for that, not for the
 * decoder guessing.
 */
const PROGRESSIVE_PAIRS: [string, () => string, () => string][] = [
  ["Inception, 4:2:0 color", () => INCEPTION_PROGRESSIVE, () => INCEPTION_BASELINE],
  ["Scarface, 4:2:0 color", () => SCARFACE_PROGRESSIVE, () => SCARFACE_BASELINE],
  ["a black-and-white poster, one component", () => GRAY_PROGRESSIVE, () => GRAY_BASELINE],
];

/** Offsets of every start-of-scan marker. 0xff 0xda never occurs inside scan data. */
function scanOffsets(b: Uint8Array): number[] {
  const out: number[] = [];
  for (let i = 2; i + 1 < b.length; i++) if (b[i] === 0xff && b[i + 1] === 0xda) out.push(i);
  return out;
}

/** Degrees between two hexes' hues; 0 when either is gray. */
function hueDistance(x: string, y: string): number {
  const hue = (hex: string) => {
    const [r, g, b] = [0, 1, 2].map((i) => channel(hex, i) / 255);
    const max = Math.max(r, g, b);
    const d = max - Math.min(r, g, b);
    if (d === 0) return null;
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  };
  const hx = hue(x);
  const hy = hue(y);
  if (hx === null || hy === null) return 0;
  const gap = Math.abs(hx - hy);
  return Math.min(gap, 360 - gap);
}

/** Where the first pass's scan data ends: the first real marker after its header. */
function firstPassEnd(b: Uint8Array): number {
  const sos = scanOffsets(b)[0];
  let i = sos + 2 + ((b[sos + 2] << 8) | b[sos + 3]);
  while (!(b[i] === 0xff && b[i + 1] !== 0x00 && (b[i + 1] < 0xd0 || b[i + 1] > 0xd7))) i++;
  return i;
}

/** A copy of `b` with the first scan header's Ss, Se and Ah/Al bytes replaced. */
function withFirstScanHeader(b: Uint8Array, ss: number, se: number, ahal: number): Uint8Array {
  const out = b.slice();
  const sos = scanOffsets(out)[0];
  const o = sos + 5 + out[sos + 4] * 2;
  out[o] = ss;
  out[o + 1] = se;
  out[o + 2] = ahal;
  return out;
}

describe("progressive JPEG", () => {
  for (const [name, prog, base] of PROGRESSIVE_PAIRS) {
    it(`reads ${name} to the same blocks as its baseline twin`, () => {
      const a = decoded(prog());
      const b = decoded(base());
      expect(a.width).toBe(b.width);
      expect(a.height).toBe(b.height);
      let sum = 0;
      let worst = 0;
      for (let i = 0; i < a.rgb.length; i++) {
        const d = Math.abs(a.rgb[i] - b.rgb[i]);
        sum += d;
        worst = Math.max(worst, d);
      }
      expect(sum / a.rgb.length).toBeLessThan(1.5);
      expect(worst).toBeLessThanOrEqual(12);
    });

    it(`gives ${name} the colors its baseline twin gets`, () => {
      const a = colorsOf(prog());
      const b = colorsOf(base());
      for (let c = 0; c < 3; c++) {
        expect(Math.abs(channel(a.colorA, c) - channel(b.colorA, c))).toBeLessThanOrEqual(4);
      }
      // colorB averages a handful of blocks, so the twin's second encode moves
      // its shade (Inception's red: #80211e here, #80444c on the twin). The hue
      // has to hold.
      expect(hueDistance(a.colorB, b.colorB)).toBeLessThanOrEqual(15);
    });
  }

  it("reads the synthetic test poster's progressive encoding", () => {
    expect(worstSampleError(decoded(PROGRESSIVE))).toBeLessThanOrEqual(12);
  });

  it("reads a first pass split per component with restart markers", () => {
    // SCARFACE_SPLIT_RESTART carries the same DC values as SCARFACE_PROGRESSIVE,
    // rewritten as one pass per component with a restart marker every 5 blocks.
    const split = decoded(SCARFACE_SPLIT_RESTART);
    expect(split.rgb.join(",")).toBe(decoded(SCARFACE_PROGRESSIVE).rgb.join(","));
  });

  it("returns null when the file ends inside the first pass", () => {
    const full = bytes(INCEPTION_PROGRESSIVE);
    const start = scanOffsets(full)[0];
    const end = firstPassEnd(full);
    expect(decodeJpegBlockAverages(full.slice(0, start + 20))).toBe(null);
    expect(decodeJpegBlockAverages(full.slice(0, Math.floor((start + end) / 2)))).toBe(null);
    expect(posterColorsFromJpeg(full.slice(0, end - 4))).toBe(null);
  });

  it("needs nothing after the first pass", () => {
    const full = bytes(INCEPTION_PROGRESSIVE);
    const cut = decodeJpegBlockAverages(full.slice(0, firstPassEnd(full)));
    expect(cut?.rgb.join(",")).toBe(decoded(INCEPTION_PROGRESSIVE).rgb.join(","));
  });

  it("refuses a file whose first pass is not a plain DC pass", () => {
    const full = bytes(SCARFACE_PROGRESSIVE);
    // An AC pass before any DC pass.
    expect(decodeJpegBlockAverages(withFirstScanHeader(full, 1, 5, 0x01))).toBe(null);
    // A DC refinement pass before the first DC pass.
    expect(decodeJpegBlockAverages(withFirstScanHeader(full, 0, 0, 0x10))).toBe(null);
    // A DC pass that also claims AC coefficients, which the format forbids.
    expect(decodeJpegBlockAverages(withFirstScanHeader(full, 0, 63, 0x01))).toBe(null);
    // A point transform past the format's limit of 13.
    expect(decodeJpegBlockAverages(withFirstScanHeader(full, 0, 0, 0x0e))).toBe(null);
  });

  it("refuses a second frame header between first passes", () => {
    // Splice a copy of the frame header in front of the second per-component
    // pass. The luma pass already read belongs to the first header, so the
    // second header's luma would be empty, and the answer would be gray.
    const b = bytes(SCARFACE_SPLIT_RESTART);
    let sof = 2;
    while (!(b[sof] === 0xff && b[sof + 1] === 0xc2)) sof++;
    const header = b.slice(sof, sof + 2 + ((b[sof + 2] << 8) | b[sof + 3]));
    const at = scanOffsets(b)[1];
    const spliced = new Uint8Array(b.length + header.length);
    spliced.set(b.slice(0, at));
    spliced.set(header, at);
    spliced.set(b.slice(at), at + header.length);
    expect(decodeJpegBlockAverages(b)).not.toBe(null);
    expect(decodeJpegBlockAverages(spliced)).toBe(null);
  });

  it("never throws on a cut or damaged file", () => {
    const full = bytes(SCARFACE_PROGRESSIVE);
    let threw = false;
    try {
      for (let cut = 0; cut < full.length; cut += 7) decodeJpegBlockAverages(full.slice(0, cut));
      for (let i = 2; i < full.length; i += 13) {
        const damaged = full.slice();
        damaged[i] ^= 0xa5;
        decodeJpegBlockAverages(damaged);
      }
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
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

const INCEPTION_PROGRESSIVE =
  "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";

const INCEPTION_BASELINE =
  "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";

const SCARFACE_PROGRESSIVE =
  "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";

const SCARFACE_BASELINE =
  "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";

const GRAY_PROGRESSIVE =
  "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";

const GRAY_BASELINE =
  "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";

const SCARFACE_SPLIT_RESTART =
  "/9j/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wgARCACKAFwDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/90ABAAF/9oACAEBAAAAAfH0A//Q8s+sgP/R9eX4/Q//0vHS/wDWJ//T9fQX4/8A/9Tx0RZ//9V/oG2H/9b175AQT//X8cXtO69T/9D18Pj4/9Hx1B3uP//S9A3wP//T8dEF/9TgOi6/00//1fXz4+Q//9bxw94xPTf/1/TtAX4+/9DyaVHetf/R6Hep1et//9L174/15aP/0/POs6KDV//U0/RJ/j+x/9XhsbU9DP/WodZk+qSf/9fx29fim//QzeprTVf/0fT7/wAfof/S8cPcfUD/0/VqWqvx9//U8cA9C//V9XsUm3//1vX/AI+QP//X8c3vbe3P/9D18Pj5P//R8cC57J//0vXlA//T8dEF/9Tx3172IP/V9ePj8P/W8dD033P/1/XgPkD/0PHgD//Rw/ewP//S9f8A/9oACAECAAAAAQA//9AAP//RAD//0gEb/9Ngj2f/1Ksautf/1Wxip//WRQP/1wA//9AAP//RAP/aAAgBAwAAAAEAP//QAD//0QA//9IB8v8A/9O0i1rP/9TfuRwYH//VkuPjX//WVAP/1wA//9AAP//RAP/Z";
