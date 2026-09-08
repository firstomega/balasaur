/**
 * Two colors out of a poster, computed from the actual pixels, with no
 * dependency and no browser.
 *
 * WHY THIS IS NOT A FULL JPEG DECODER. A poster only has to become a ~12x18
 * grid of average colors, and a baseline JPEG already stores exactly that: the
 * DC coefficient of each 8x8 block IS that block's average (an inverse DCT of a
 * DC-only block is a flat tile of value DC/8 + 128). So the decoder below walks
 * the entropy stream, keeps the DC coefficient of every block, and Huffman-skips
 * the AC coefficients it does not need. No IDCT, no upsampling, no color
 * management. That is honest decoding of the file, not a guess: the numbers it
 * returns are the encoder's own block averages.
 *
 * What it refuses: progressive JPEG (SOF2), arithmetic coding, CMYK, and
 * anything that is not a JPEG. Those return null and the caller stores no color,
 * which is the same path a failed download takes. TMDB serves baseline JPEG at
 * /t/p/w92.
 */

export interface PosterColors {
  /** Dominant color, as lowercase #rrggbb. */
  colorA: string;
  /** Strongest color at least 45 degrees of hue from colorA, as lowercase #rrggbb. */
  colorB: string;
}

export interface BlockImage {
  /** Blocks across, one per 8 pixels of the source. */
  width: number;
  /** Blocks down. */
  height: number;
  /** width * height * 3 bytes, RGB. */
  rgb: Uint8Array;
}

// ---------------------------------------------------------------- JPEG markers

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const DQT = 0xdb;
const DRI = 0xdd;
const DHT = 0xc4;

/** Start-of-frame markers this decoder accepts: baseline and extended sequential. */
const SUPPORTED_SOF = new Set([0xc0, 0xc1]);
/** Every other SOF is progressive, lossless, or arithmetic-coded. */
const UNSUPPORTED_SOF = new Set([0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

interface HuffTable {
  mincode: Int32Array;
  maxcode: Int32Array;
  valptr: Int32Array;
  values: Uint8Array;
}

interface FrameComponent {
  id: number;
  h: number;
  v: number;
  quantId: number;
  /** DC value per block, at this component's own block resolution. */
  plane: Int16Array;
  blocksPerLine: number;
  blocksPerColumn: number;
  pred: number;
  dcTable: number;
  acTable: number;
}

function buildHuffTable(counts: Uint8Array, values: Uint8Array): HuffTable {
  const mincode = new Int32Array(17);
  const maxcode = new Int32Array(17).fill(-1);
  const valptr = new Int32Array(17);
  let code = 0;
  let k = 0;
  for (let l = 1; l <= 16; l++) {
    if (counts[l] === 0) {
      maxcode[l] = -1;
      code <<= 1;
      continue;
    }
    valptr[l] = k;
    mincode[l] = code;
    k += counts[l];
    code += counts[l];
    maxcode[l] = code - 1;
    code <<= 1;
  }
  return { mincode, maxcode, valptr, values };
}

/**
 * Decode a baseline JPEG down to one average color per 8x8 block.
 * Returns null for anything it cannot read honestly.
 */
export function decodeJpegBlockAverages(bytes: Uint8Array): BlockImage | null {
  try {
    return decodeUnsafe(bytes);
  } catch {
    return null;
  }
}

function decodeUnsafe(data: Uint8Array): BlockImage | null {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== SOI) return null;

  const quant: (Int32Array | null)[] = [null, null, null, null];
  const dcTables: (HuffTable | null)[] = [null, null, null, null];
  const acTables: (HuffTable | null)[] = [null, null, null, null];
  let frame: {
    width: number;
    height: number;
    hMax: number;
    vMax: number;
    mcusPerLine: number;
    mcusPerColumn: number;
    components: FrameComponent[];
  } | null = null;
  let restartInterval = 0;

  let p = 2;
  while (p < data.length) {
    if (data[p] !== 0xff) {
      p++;
      continue;
    }
    let marker = data[p + 1];
    while (marker === 0xff) {
      p++;
      marker = data[p + 1];
    }
    p += 2;
    if (marker === EOI) break;
    // Standalone markers carry no length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (p + 1 >= data.length) break;
    const length = (data[p] << 8) | data[p + 1];
    const segStart = p + 2;
    const segEnd = p + length;
    if (segEnd > data.length) return null;

    if (marker === DQT) {
      let q = segStart;
      while (q < segEnd) {
        const precision = data[q] >> 4;
        const id = data[q] & 15;
        q++;
        const table = new Int32Array(64);
        for (let i = 0; i < 64; i++) {
          if (precision === 0) {
            table[i] = data[q + i];
          } else {
            table[i] = (data[q + i * 2] << 8) | data[q + i * 2 + 1];
          }
        }
        q += precision === 0 ? 64 : 128;
        if (id < 4) quant[id] = table;
      }
    } else if (UNSUPPORTED_SOF.has(marker)) {
      return null;
    } else if (SUPPORTED_SOF.has(marker)) {
      const height = (data[segStart + 1] << 8) | data[segStart + 2];
      const width = (data[segStart + 3] << 8) | data[segStart + 4];
      const count = data[segStart + 5];
      if (!width || !height || count < 1 || count > 3) return null;
      const components: FrameComponent[] = [];
      let hMax = 1;
      let vMax = 1;
      for (let i = 0; i < count; i++) {
        const o = segStart + 6 + i * 3;
        const h = data[o + 1] >> 4 || 1;
        const v = data[o + 1] & 15 || 1;
        hMax = Math.max(hMax, h);
        vMax = Math.max(vMax, v);
        components.push({
          id: data[o],
          h,
          v,
          quantId: data[o + 2],
          plane: new Int16Array(0),
          blocksPerLine: 0,
          blocksPerColumn: 0,
          pred: 0,
          dcTable: 0,
          acTable: 0,
        });
      }
      const mcusPerLine = Math.ceil(width / (8 * hMax));
      const mcusPerColumn = Math.ceil(height / (8 * vMax));
      for (const c of components) {
        c.blocksPerLine = mcusPerLine * c.h;
        c.blocksPerColumn = mcusPerColumn * c.v;
        c.plane = new Int16Array(c.blocksPerLine * c.blocksPerColumn);
      }
      frame = { width, height, hMax, vMax, mcusPerLine, mcusPerColumn, components };
    } else if (marker === DHT) {
      let q = segStart;
      while (q < segEnd) {
        const cls = data[q] >> 4;
        const id = data[q] & 15;
        q++;
        const counts = new Uint8Array(17);
        let total = 0;
        for (let i = 1; i <= 16; i++) {
          counts[i] = data[q + i - 1];
          total += counts[i];
        }
        q += 16;
        const values = data.slice(q, q + total);
        q += total;
        if (id < 4) {
          const table = buildHuffTable(counts, values);
          if (cls === 0) dcTables[id] = table;
          else acTables[id] = table;
        }
      }
    } else if (marker === DRI) {
      restartInterval = (data[segStart] << 8) | data[segStart + 1];
    } else if (marker === SOS) {
      if (!frame) return null;
      const scanCount = data[segStart];
      const scan: FrameComponent[] = [];
      for (let i = 0; i < scanCount; i++) {
        const id = data[segStart + 1 + i * 2];
        const tables = data[segStart + 2 + i * 2];
        const comp = frame.components.find((c) => c.id === id);
        if (!comp) return null;
        comp.dcTable = tables >> 4;
        comp.acTable = tables & 15;
        scan.push(comp);
      }
      p = decodeScan(data, segEnd, frame, scan, dcTables, acTables, quant, restartInterval);
      continue;
    }
    p = segEnd;
  }

  if (!frame) return null;
  return compose(frame);
}

/** Decode one entropy-coded scan, DC only. Returns the offset of the next marker. */
function decodeScan(
  data: Uint8Array,
  start: number,
  frame: {
    width: number;
    height: number;
    hMax: number;
    vMax: number;
    mcusPerLine: number;
    mcusPerColumn: number;
    components: FrameComponent[];
  },
  scan: FrameComponent[],
  dcTables: (HuffTable | null)[],
  acTables: (HuffTable | null)[],
  quant: (Int32Array | null)[],
  restartInterval: number,
): number {
  let pos = start;
  let bitBuf = 0;
  let bitCount = 0;
  let hitMarker = false;

  function nextBit(): number {
    if (bitCount === 0) {
      if (pos >= data.length) {
        hitMarker = true;
        return 0;
      }
      const b = data[pos];
      if (b === 0xff) {
        const b2 = data[pos + 1];
        if (b2 === 0x00) {
          pos += 2;
        } else {
          // A real marker: the scan is over. Pad with zeros so the caller
          // unwinds instead of walking off the end.
          hitMarker = true;
          return 0;
        }
      } else {
        pos++;
      }
      bitBuf = b;
      bitCount = 8;
    }
    bitCount--;
    return (bitBuf >> bitCount) & 1;
  }

  function receive(n: number): number {
    let v = 0;
    for (let i = 0; i < n; i++) v = (v << 1) | nextBit();
    return v;
  }

  function extend(v: number, n: number): number {
    return v < 1 << (n - 1) ? v - (1 << n) + 1 : v;
  }

  function decodeHuff(table: HuffTable | null): number {
    if (!table) return 0;
    let code = nextBit();
    let l = 1;
    while (l <= 16 && code > table.maxcode[l]) {
      code = (code << 1) | nextBit();
      l++;
      if (hitMarker) return 0;
    }
    if (l > 16) return 0;
    const idx = table.valptr[l] + code - table.mincode[l];
    return idx >= 0 && idx < table.values.length ? table.values[idx] : 0;
  }

  function decodeBlock(comp: FrameComponent, row: number, col: number) {
    const t = decodeHuff(dcTables[comp.dcTable]);
    const diff = t === 0 ? 0 : extend(receive(t), t);
    comp.pred += diff;
    const q = quant[comp.quantId]?.[0] ?? 1;
    if (row < comp.blocksPerColumn && col < comp.blocksPerLine) {
      comp.plane[row * comp.blocksPerLine + col] = comp.pred * q;
    }
    // Skip the 63 AC coefficients. They still have to be Huffman-decoded to
    // advance the bit stream, but nothing is kept.
    const ac = acTables[comp.acTable];
    let k = 1;
    while (k < 64) {
      const rs = decodeHuff(ac);
      const s = rs & 15;
      const r = rs >> 4;
      if (s === 0) {
        if (r < 15) break;
        k += 16;
      } else {
        k += r;
        receive(s);
        k++;
      }
      if (hitMarker) return;
    }
  }

  function restart() {
    bitCount = 0;
    for (const c of frame.components) c.pred = 0;
    // Skip fill bytes and the RSTn marker itself.
    while (pos + 1 < data.length) {
      if (data[pos] === 0xff && data[pos + 1] >= 0xd0 && data[pos + 1] <= 0xd7) {
        pos += 2;
        hitMarker = false;
        return;
      }
      if (data[pos] === 0xff && data[pos + 1] !== 0x00) return;
      pos++;
    }
  }

  if (scan.length === 1) {
    // Non-interleaved scan: blocks in raster order over this component alone.
    const comp = scan[0];
    const cols = Math.ceil((frame.width * comp.h) / frame.hMax / 8);
    const rows = Math.ceil((frame.height * comp.v) / frame.vMax / 8);
    let n = 0;
    for (let row = 0; row < rows && !hitMarker; row++) {
      for (let col = 0; col < cols && !hitMarker; col++) {
        if (restartInterval && n > 0 && n % restartInterval === 0) restart();
        decodeBlock(comp, row, col);
        n++;
      }
    }
  } else {
    let n = 0;
    for (let my = 0; my < frame.mcusPerColumn && !hitMarker; my++) {
      for (let mx = 0; mx < frame.mcusPerLine && !hitMarker; mx++) {
        if (restartInterval && n > 0 && n % restartInterval === 0) restart();
        for (const comp of scan) {
          for (let v = 0; v < comp.v; v++) {
            for (let h = 0; h < comp.h; h++) {
              decodeBlock(comp, my * comp.v + v, mx * comp.h + h);
            }
          }
        }
        n++;
      }
    }
  }

  // Walk to the next real marker so the segment loop can carry on.
  let q = Math.max(pos, start);
  while (q + 1 < data.length) {
    if (data[q] === 0xff && data[q + 1] !== 0x00 && !(data[q + 1] >= 0xd0 && data[q + 1] <= 0xd7)) {
      return q;
    }
    q++;
  }
  return data.length;
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

function compose(frame: {
  width: number;
  height: number;
  hMax: number;
  vMax: number;
  components: FrameComponent[];
}): BlockImage | null {
  const outW = Math.max(1, Math.ceil(frame.width / 8));
  const outH = Math.max(1, Math.ceil(frame.height / 8));
  const rgb = new Uint8Array(outW * outH * 3);
  const comps = frame.components;
  // Component ids 'R','G','B' mean the file is already RGB (rare, but legal).
  const isRgb =
    comps.length === 3 && comps[0].id === 0x52 && comps[1].id === 0x47 && comps[2].id === 0x42;

  const sample = (c: FrameComponent, x: number, y: number): number => {
    const px = Math.min(Math.floor((x * c.h) / frame.hMax), c.blocksPerLine - 1);
    const py = Math.min(Math.floor((y * c.v) / frame.vMax), c.blocksPerColumn - 1);
    // A DC-only block is flat at DC/8, plus the level shift the encoder removed.
    return clampByte(Math.round(c.plane[py * c.blocksPerLine + px] / 8) + 128);
  };

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const o = (y * outW + x) * 3;
      if (comps.length === 1) {
        const g = sample(comps[0], x, y);
        rgb[o] = g;
        rgb[o + 1] = g;
        rgb[o + 2] = g;
      } else if (isRgb) {
        rgb[o] = sample(comps[0], x, y);
        rgb[o + 1] = sample(comps[1], x, y);
        rgb[o + 2] = sample(comps[2], x, y);
      } else if (comps.length === 3) {
        const yy = sample(comps[0], x, y);
        const cb = sample(comps[1], x, y) - 128;
        const cr = sample(comps[2], x, y) - 128;
        rgb[o] = clampByte(Math.round(yy + 1.402 * cr));
        rgb[o + 1] = clampByte(Math.round(yy - 0.344136 * cb - 0.714136 * cr));
        rgb[o + 2] = clampByte(Math.round(yy + 1.772 * cb));
      } else {
        return null;
      }
    }
  }
  return { width: outW, height: outH, rgb };
}

// ------------------------------------------------------------- color selection

/** 12 hue bins of 30 degrees, plus one bin for everything too gray to have a hue. */
const HUE_BINS = 12;
const NEUTRAL_BIN = HUE_BINS;
/** Below this saturation a pixel has no usable hue, so it counts as neutral. */
const NEUTRAL_S = 0.15;
/** Letterboxing, black bars and blown highlights say nothing about the poster. */
const MIN_V = 0.06;
const MAX_V = 0.97;
/** Two colors this close in hue read as one color, so colorB looks elsewhere. */
const MIN_HUE_GAP = 45;

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [
    clampByte(Math.round((r + m) * 255)),
    clampByte(Math.round((g + m) * 255)),
    clampByte(Math.round((b + m) * 255)),
  ];
}

/** Lowercase #rrggbb, the only form the database accepts. */
export function hexFromRgb(r: number, g: number, b: number): string {
  const two = (n: number) => clampByte(n).toString(16).padStart(2, "0");
  return `#${two(r)}${two(g)}${two(b)}`;
}

function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Pull a color into the range that works as a 22%-opacity wash on a near-black
 * page: not so dark it disappears, not so bright it lights up the text. A
 * neutral color stays neutral, because a black-and-white poster glowing purple
 * would be a lie about the poster.
 */
function toGlowColor(r: number, g: number, b: number): string {
  const { h, s, v } = rgbToHsv(r, g, b);
  if (s < NEUTRAL_S) {
    return hexFromRgb(...hsvToRgb(h, Math.min(s, 0.1), Math.min(Math.max(v, 0.42), 0.62)));
  }
  return hexFromRgb(
    ...hsvToRgb(h, Math.min(Math.max(s, 0.45), 0.85), Math.min(Math.max(v, 0.5), 0.78)),
  );
}

interface Bin {
  index: number;
  weight: number;
  r: number;
  g: number;
  b: number;
  hue: number;
}

/**
 * The two colors of an RGB grid. Deterministic: same pixels in, same hexes out.
 * Returns null when the image has nothing to say (all black, all white, empty).
 */
export function posterColorsFromPixels(
  rgb: ArrayLike<number>,
  width: number,
  height: number,
): PosterColors | null {
  const count = Math.min(width * height, Math.floor(rgb.length / 3));
  if (count <= 0) return null;
  const weight = new Float64Array(HUE_BINS + 1);
  const rs = new Float64Array(HUE_BINS + 1);
  const gs = new Float64Array(HUE_BINS + 1);
  const bs = new Float64Array(HUE_BINS + 1);
  const hx = new Float64Array(HUE_BINS + 1);
  const hy = new Float64Array(HUE_BINS + 1);

  for (let i = 0; i < count; i++) {
    const r = rgb[i * 3];
    const g = rgb[i * 3 + 1];
    const b = rgb[i * 3 + 2];
    const { h, s, v } = rgbToHsv(r, g, b);
    if (v < MIN_V || v > MAX_V) continue;
    const bin =
      s < NEUTRAL_S ? NEUTRAL_BIN : Math.min(HUE_BINS - 1, Math.floor(h / (360 / HUE_BINS)));
    // A saturated pixel votes harder than a muddy one, so a poster's one real
    // color beats the gray sludge around it without a 3-pixel neon accent
    // winning outright.
    const w = 1 + 2 * s;
    weight[bin] += w;
    rs[bin] += r * w;
    gs[bin] += g * w;
    bs[bin] += b * w;
    hx[bin] += Math.cos((h * Math.PI) / 180) * w;
    hy[bin] += Math.sin((h * Math.PI) / 180) * w;
  }

  const bins: Bin[] = [];
  for (let i = 0; i <= HUE_BINS; i++) {
    if (weight[i] <= 0) continue;
    let hue = (Math.atan2(hy[i], hx[i]) * 180) / Math.PI;
    if (hue < 0) hue += 360;
    bins.push({
      index: i,
      weight: weight[i],
      r: rs[i] / weight[i],
      g: gs[i] / weight[i],
      b: bs[i] / weight[i],
      hue,
    });
  }
  if (bins.length === 0) return null;
  // Ties break on bin index so the result never depends on sort stability.
  bins.sort((a, b) => b.weight - a.weight || a.index - b.index);

  const a = bins[0];
  const floor = a.weight * 0.05;
  const second =
    bins
      .slice(1)
      .find(
        (c) =>
          c.weight >= floor &&
          (c.index === NEUTRAL_BIN ||
            a.index === NEUTRAL_BIN ||
            hueGap(c.hue, a.hue) >= MIN_HUE_GAP),
      ) ??
    bins.find((c) => c.index !== a.index && c.weight >= floor) ??
    null;

  const colorA = toGlowColor(a.r, a.g, a.b);
  if (!second) {
    // One color poster. Rotate the hue a little for the second gradient so the
    // wash has some depth instead of reading as a single flat blob.
    const { h, s, v } = rgbToHsv(a.r, a.g, a.b);
    const [r2, g2, b2] = hsvToRgb((h + 32) % 360, s, v * 0.82);
    return { colorA, colorB: toGlowColor(r2, g2, b2) };
  }
  return { colorA, colorB: toGlowColor(second.r, second.g, second.b) };
}

/** Poster bytes in, two hexes out. Null whenever the bytes cannot be read. */
export function posterColorsFromJpeg(bytes: Uint8Array): PosterColors | null {
  const img = decodeJpegBlockAverages(bytes);
  if (!img) return null;
  return posterColorsFromPixels(img.rgb, img.width, img.height);
}
