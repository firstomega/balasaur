// The Taste Card as an image: a 1080x1920 canvas (the size every story and
// short-form feed accepts), drawn by hand with no library.
//
// HOW IT IS COMPOSED. A card is looked at first as a thumbnail in somebody
// else's feed, at maybe 200 pixels wide, for under a second. So the name and
// the sentence that proves it own the top half at a size that survives that,
// and the posters, the scores and the counts fill the bottom half.
//
// HOW IT IS COLOURED. The site's Colour Shelf look: a white ground, and the top
// half painted flat in one of the 14 tile swatches with that swatch's own ink,
// the swatch of the highest-scoring poster on the card (`cardSwatch`). A poster
// the catalog has not read yet supplies its swatch from its own pixels, through
// the same rule the nightly sync uses. No poster with a swatch: the paper wash.
// Scores sit on the posters as the site's sticker: white, a black edge, a black
// number.
//
// Nothing here blocks on a network. A tile whose image is slow, blocked or
// missing is painted in its swatch and prints the title instead, so it never
// leaves a hole.
//
// The wrap and share helpers come from the arcade's share card so the two
// images behave identically in the share sheet.

import { dinoPaths, dinoWeight, DINO_MARK_ORIGIN_Y } from "@/components/balasaur/DinoMark";
import { canShareFiles, wrapLines } from "@/lib/arcade/shareImage";
import { SWATCHES, posterSwatchFromPixels, type SwatchKey } from "@/lib/posterSwatch";
import { tmdbImage } from "@/lib/tmdbImage";
import { cardSwatch, type CardPoster } from "@/lib/taste";

export const TASTE_CARD_W = 1080;
export const TASTE_CARD_H = 1920;

/** Poster width requested from TMDB. The preview asks for the same size, so
 *  the canvas draws from an image the browser has already fetched. */
export const POSTER_SIZE = "w342";

// House palette, mirrored from styles.css because a canvas cannot read CSS
// variables. Keep in step with `:root` there (--paper, --wash, --ink,
// --ink-muted). The swatch fills and inks come from posterSwatch.ts, which
// palette.test.ts already holds to 4.5:1.
const PAPER = "#ffffff";
const WASH = "#f4f4f6";
const INK = "#111114";
const INK_MUTED = "#55555e";

const SANS = "Archivo, system-ui, sans-serif";
const DISPLAY = "'Archivo Condensed', 'Arial Narrow', sans-serif";

const PAD = 80;
const INNER = TASTE_CARD_W - PAD * 2;

export interface TasteCardOptions {
  /** The archetype name, and the one sentence that proves it. */
  name: string;
  evidence: string;
  /** The three counts the sentence divides by. */
  counts: { liked: number; watched: number; want: number };
  decades: number;
  /** Up to four, already ordered highest score first. */
  posters: CardPoster[];
  /** Defaults to balasaur.com/taste. */
  url?: string;
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawDino(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
) {
  // Drawn from the same path data as DinoMark, so the card and the site can
  // never ship two different animals. The mark's viewBox starts at y=1.3, so
  // the origin shifts up before scaling.
  const scale = size / 24;
  const filled = size >= 56;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.translate(0, -DINO_MARK_ORIGIN_Y);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const p of dinoPaths("calm", filled, dinoWeight(size))) {
    ctx.globalAlpha = p.ink ?? 1;
    const path = new Path2D(p.d);
    if (p.fill) {
      ctx.fill(path, p.evenOdd ? "evenodd" : "nonzero");
    } else {
      ctx.lineWidth = p.width ?? dinoWeight(size);
      ctx.stroke(path);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * One poster, fetched for the canvas. Resolves null on error or after the
 * timeout, never rejects: the card is drawn either way.
 *
 * crossOrigin is required twice over: a canvas that has drawn a same-origin-
 * opaque image cannot be exported at all, and cannot be read back for its
 * colours either. TMDB serves the images with permissive CORS headers, and
 * anything that does not is simply skipped.
 */
function loadPoster(url: string, timeoutMs = 2500): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (img: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      resolve(img);
    };
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => done(img);
    img.onerror = () => done(null);
    setTimeout(() => done(null), timeoutMs);
    img.src = tmdbImage(url, POSTER_SIZE) || url;
  });
}

async function ensureFonts() {
  try {
    await Promise.all([
      document.fonts.load(`800 160px ${DISPLAY}`),
      document.fonts.load("500 46px Archivo"),
      document.fonts.load("700 34px Archivo"),
    ]);
  } catch {
    // The system stack draws instead. Layout is measured, not assumed.
  }
}

/** The condensed cut sets words close, as it does on the site, where
 *  `.font-display` adds a little word spacing. Same here where the canvas
 *  supports it. */
function setFont(ctx: CanvasRenderingContext2D, font: string, wordSpacing = "0px") {
  ctx.font = font;
  const c = ctx as CanvasRenderingContext2D & { wordSpacing?: string };
  if ("wordSpacing" in c) c.wordSpacing = wordSpacing;
}

function displayFont(ctx: CanvasRenderingContext2D, size: number) {
  setFont(ctx, `800 ${size}px ${DISPLAY}`, `${Math.round(size * 0.06)}px`);
}

/** Cover-fit an image into a box, cropping the overflow. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const iw = img.naturalWidth || w;
  const ih = img.naturalHeight || h;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/**
 * The biggest display size at which the whole text still fits in `maxLines`.
 * Nothing is ever dropped: a size that would truncate it is rejected rather
 * than printed short.
 */
function fitDisplay(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
  sizes: number[],
): { size: number; lines: string[] } {
  const whole = text.split(/\s+/).filter(Boolean).join(" ");
  let last = { size: sizes[sizes.length - 1], lines: [text] };
  for (const size of sizes) {
    displayFont(ctx, size);
    const measure = (s: string) => ctx.measureText(s).width;
    const lines = wrapLines(measure, text, maxWidth, maxLines);
    last = { size, lines };
    if (lines.join(" ") === whole && lines.every((l) => measure(l) <= maxWidth)) {
      return { size, lines };
    }
  }
  return last;
}

/**
 * A loaded poster's swatch, read off its own pixels through the same rule the
 * nightly sync uses on the server: the poster scaled to a 12 by 18 grid of
 * block averages. Null whenever the pixels cannot be read.
 */
function swatchFromImage(img: HTMLImageElement): SwatchKey | null {
  try {
    const w = 12;
    const h = 18;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return null;
    g.drawImage(img, 0, 0, w, h);
    const data = g.getImageData(0, 0, w, h).data;
    const rgb = new Uint8Array(w * h * 3);
    for (let i = 0; i < w * h; i++) {
      rgb[i * 3] = data[i * 4];
      rgb[i * 3 + 1] = data[i * 4 + 1];
      rgb[i * 3 + 2] = data[i * 4 + 2];
    }
    return posterSwatchFromPixels(rgb, w, h)?.swatch ?? null;
  } catch {
    return null;
  }
}

/** Stored swatches win; a poster without one supplies its own from its pixels. */
function withSwatches(posters: CardPoster[], images: (HTMLImageElement | null)[]): CardPoster[] {
  return posters.map((p, i) => {
    if (p.swatch) return p;
    const img = images[i];
    const found = img ? swatchFromImage(img) : null;
    return found ? { ...p, swatch: found } : p;
  });
}

/** A surface's fill and the ink that reads on it. */
function surface(key: SwatchKey | null | undefined): { fill: string; ink: string } {
  return key ? { fill: SWATCHES[key].fill, ink: SWATCHES[key].ink } : { fill: WASH, ink: INK };
}

/** The score sticker, as ScoreBadge draws it: white, a black edge, a black
 *  number in the display face, tilted on the poster's corner. */
function drawSticker(ctx: CanvasRenderingContext2D, x: number, y: number, score: number) {
  const label = String(score);
  displayFont(ctx, 58);
  const w = ctx.measureText(label).width + 34;
  const h = 72;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((-6 * Math.PI) / 180);
  roundRect(ctx, -w / 2, -h / 2, w, h, 12);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.fillText(label, 0, 21);
  ctx.restore();
  ctx.textAlign = "left";
}

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

/** Draw the card and hand back the PNG. */
export async function renderTasteCard(o: TasteCardOptions): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = TASTE_CARD_W;
  canvas.height = TASTE_CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");

  const posters = o.posters.slice(0, 4);
  const [images] = await Promise.all([
    Promise.all(posters.map((p) => loadPoster(p.posterUrl))),
    ensureFonts(),
  ]);

  const painted = withSwatches(posters, images);
  const top = surface(cardSwatch(painted));
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  const measure = (s: string) => ctx.measureText(s).width;

  // --- The top half, laid out first so the painted block can be sized to it.

  const head = fitDisplay(ctx, o.name, INNER, 2, [196, 176, 160, 144, 128, 112, 100]);
  const headStep = Math.round(head.size * 0.94);
  const headFirst = 236 + Math.round(head.size * 0.78);
  const headLast = headFirst + headStep * (head.lines.length - 1);

  setFont(ctx, `500 46px ${SANS}`);
  const sentence = wrapLines(measure, o.evidence, INNER, 3);
  const sentenceFirst = headLast + 96;
  const sentenceLast = sentenceFirst + 62 * (sentence.length - 1);

  // The counts, directly under the sentence that divides by them: "70% of what
  // you Loved" is checkable against "10 LOVED" without moving your eye.
  const dividerY = sentenceLast + 70;
  const numberBaseline = dividerY + 118;
  const labelBaseline = numberBaseline + 46;

  // The posters in a row, as tall as the room allows up to 1.75 times their
  // width (the crop stays under a sixth of the artwork's width). The row sits
  // on the footer and straddles the painted edge, so the slack from a
  // one-line versus two-line name goes into the colour rather than leaving a
  // white gap, and the posters peek out of the block the way they do on the
  // site's list tiles.
  const footerY = TASTE_CARD_H - PAD;
  const n = Math.max(posters.length, 1);
  const side = 48;
  const gap = 20;
  const tileW = Math.floor((TASTE_CARD_W - side * 2 - gap * (n - 1)) / n);
  const rowBottom = footerY - 140;
  const rowTopLimit = labelBaseline + 96;
  const tileH = Math.max(260, Math.min(rowBottom - rowTopLimit, Math.round(tileW * 1.75)));
  const rowTop = rowBottom - tileH;
  const blockBottom = Math.max(labelBaseline + 72, rowTop + Math.round(tileH * 0.42));

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, TASTE_CARD_W, TASTE_CARD_H);
  ctx.fillStyle = top.fill;
  ctx.fillRect(0, 0, TASTE_CARD_W, blockBottom);

  drawDino(ctx, PAD, 62, 74, top.ink);
  displayFont(ctx, 48);
  ctx.fillStyle = top.ink;
  ctx.fillText("balasaur", PAD + 96, 122);

  displayFont(ctx, head.size);
  ctx.fillStyle = top.ink;
  head.lines.forEach((line, i) => ctx.fillText(line, PAD, headFirst + headStep * i));

  setFont(ctx, `500 46px ${SANS}`);
  sentence.forEach((line, i) => ctx.fillText(line, PAD, sentenceFirst + 62 * i));

  ctx.globalAlpha = 0.3;
  ctx.fillRect(PAD, dividerY, INNER, 3);
  ctx.globalAlpha = 1;

  const stats: [number, string][] = [
    [o.counts.liked, "LOVED"],
    [o.counts.watched, "WATCHED"],
    [o.counts.want, "WATCHLIST"],
    [o.decades, o.decades === 1 ? "DECADE" : "DECADES"],
  ];
  const col = INNER / 4;
  stats.forEach(([n, label], i) => {
    const cx = PAD + col * i;
    displayFont(ctx, 110);
    ctx.fillText(String(n), cx, numberBaseline);
    setFont(ctx, `700 25px ${SANS}`);
    ctx.fillText(label, cx, labelBaseline);
  });

  // --- The bottom, laid out upwards from the footer. ------------------------

  setFont(ctx, `700 36px ${SANS}`);
  ctx.fillStyle = INK;
  ctx.fillText(o.url ?? "balasaur.com/taste", PAD, footerY - 42);
  setFont(ctx, `500 25px ${SANS}`);
  ctx.fillStyle = INK_MUTED;
  ctx.fillText("Title data from TMDB and OMDb", PAD, footerY);

  // Every title standing in for a missing poster is set at one size: the
  // largest the longest of them can hold. Four tiles at four sizes read as an
  // accident.
  const unlit = posters.filter((_, i) => !images[i]);
  const titleSize = unlit.length
    ? Math.min(
        ...unlit.map((p) => fitDisplay(ctx, p.title, tileW - 36, 5, [60, 52, 44, 38, 32]).size),
      )
    : 0;

  posters.forEach((p, i) => {
    const px = side + i * (tileW + gap);
    const tile = surface(painted[i]?.swatch);
    // A paper ring, so a dark poster on a dark block still has an edge.
    roundRect(ctx, px - 6, rowTop - 6, tileW + 12, tileH + 12, 22);
    ctx.fillStyle = PAPER;
    ctx.fill();
    ctx.save();
    roundRect(ctx, px, rowTop, tileW, tileH, 16);
    ctx.clip();

    // The colour goes down first, every time. The poster is drawn over it, so a
    // tile whose image never arrives is the same tile with its title showing.
    ctx.fillStyle = tile.fill;
    ctx.fillRect(px, rowTop, tileW, tileH);

    const img = images[i];
    if (img) {
      drawCover(ctx, img, px, rowTop, tileW, tileH);
    } else {
      displayFont(ctx, titleSize);
      const step = Math.round(titleSize * 1.02);
      const lines = wrapLines(measure, p.title, tileW - 36, 5);
      ctx.fillStyle = tile.ink;
      ctx.textAlign = "center";
      let ty = rowTop + (tileH - lines.length * step) / 2 + titleSize * 0.8;
      for (const line of lines) {
        ctx.fillText(line, px + tileW / 2, ty);
        ty += step;
      }
      ctx.textAlign = "left";
    }
    ctx.restore();

    // The sticker is what makes the order on the card explain itself.
    if (p.score !== undefined) drawSticker(ctx, px + 10, rowTop + 12, p.score);
  });

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
}

export type TasteCardOutcome = "shared" | "saved" | "opened" | "blocked" | "cancelled" | "failed";

function fileName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `balasaur-taste-${slug || "card"}.png`;
}

/** Trigger a download of an already-drawn card. Returns false when the
 *  browser has no download attribute to work with. */
function saveBlob(blob: Blob, name: string): boolean {
  const a = document.createElement("a");
  if (!("download" in a)) return false;
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

/**
 * Share the card: the OS share sheet with the PNG attached where that exists,
 * a download where it does not, and a new tab where neither works. Call it
 * straight from a click so a popup blocker sees the gesture.
 */
export async function shareTasteCard(o: TasteCardOptions, blob?: Blob): Promise<TasteCardOutcome> {
  const viaSheet = canShareFiles();
  try {
    const png = blob ?? (await renderTasteCard(o));
    const name = fileName(o.name);
    if (viaSheet) {
      const file = new File([png], name, { type: "image/png" });
      await navigator.share({ files: [file], title: `${o.name} on Balasaur` });
      return "shared";
    }
    if (saveBlob(png, name)) return "saved";
    const opened = window.open("", "_blank");
    if (!opened) return "blocked";
    const url = URL.createObjectURL(png);
    opened.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return "opened";
  } catch (e) {
    // Closing the share sheet is a decision, not a failure.
    if ((e as { name?: string })?.name === "AbortError") return "cancelled";
    return "failed";
  }
}

/** Save the card without going through the share sheet. */
export async function saveTasteCard(o: TasteCardOptions, blob?: Blob): Promise<TasteCardOutcome> {
  try {
    const png = blob ?? (await renderTasteCard(o));
    if (saveBlob(png, fileName(o.name))) return "saved";
    const opened = window.open("", "_blank");
    if (!opened) return "blocked";
    const url = URL.createObjectURL(png);
    opened.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return "opened";
  } catch {
    return "failed";
  }
}
