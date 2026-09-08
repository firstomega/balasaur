// The Taste Card as an image: a 1080x1920 canvas (the size every story and
// short-form feed accepts), drawn by hand with no library.
//
// HOW IT IS COMPOSED. A card is looked at first as a thumbnail in somebody
// else's feed, at maybe 200 pixels wide, for under a second. So the name and
// the sentence that proves it own the top half at a size that survives that,
// and the posters, the scores and the counts fill the bottom half. The first
// version stacked everything into the last third and left the top forty per
// cent empty, which in a feed is a black rectangle.
//
// HOW IT IS COLOURED. The ground is lit by the colours of the titles printed
// on the card, taken from `media.color_a` where the catalog has it and read
// off the poster pixels where it does not. Two people's cards do not match.
// `tintAlpha` caps how strong each lamp may burn so white type keeps its
// contrast whatever the posters happened to be.
//
// Nothing here blocks on a network. Posters are fetched with a timeout and a
// failed one draws as a titled tile, so a slow CDN or a blocked image costs a
// thumbnail and never the card.
//
// The wrap and share helpers come from the arcade's share card so the two
// images behave identically in the share sheet.

import { dinoPaths, dinoWeight, DINO_MARK_ORIGIN_Y } from "@/components/balasaur/DinoMark";
import { canShareFiles, wrapLines } from "@/lib/arcade/shareImage";
import { posterColorsFromPixels } from "@/lib/posterColor";
import { tmdbImage } from "@/lib/tmdbImage";
import { cardTint, parseHex, tintAlpha, type CardPoster, type CardTint } from "@/lib/taste";

export const TASTE_CARD_W = 1080;
export const TASTE_CARD_H = 1920;

/** Poster width requested from TMDB. The preview asks for the same size, so
 *  the canvas draws from an image the browser has already fetched. */
export const POSTER_SIZE = "w342";

// House palette, mirrored from styles.css because a canvas cannot read CSS
// variables. Keep in step with `:root` there.
const GROUND = "#08090b";
const PANEL = "#12161c";
const BRIGHT = "#ffffff";
/** The proof sentence sits on the lit half, so it is brighter than body copy
 *  elsewhere on the site: it clears 4.5:1 over any tint `tintAlpha` allows. */
const SENTENCE = "#dfe1dd";
const DIM = "#8a887f";

const SANS = "Archivo, system-ui, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

const PAD = 80;
const INNER = TASTE_CARD_W - PAD * 2;

/** Score colors, matching ScoreBadge's tiers so a score reads the same here. */
function scoreColor(score: number): string {
  if (score >= 85) return "#6ee7b7";
  if (score >= 70) return "#d9f99d";
  if (score >= 60) return "#fde68a";
  return "#fdba74";
}

export interface TasteCardOptions {
  /** The archetype name, and the one sentence that proves it. */
  name: string;
  evidence: string;
  /** The three counts the sentence divides by. */
  counts: { liked: number; watched: number; want: number };
  decades: number;
  /** Up to four, already ordered highest score first. */
  posters: CardPoster[];
  /** "You liked Venom. Critics gave it 31." Omitted when nothing was panned. */
  contrarian?: string | null;
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
      document.fonts.load("900 120px Archivo"),
      document.fonts.load("500 46px Archivo"),
      document.fonts.load("600 78px 'JetBrains Mono'"),
    ]);
  } catch {
    // The system stack draws instead. Layout is measured, not assumed.
  }
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
 * The biggest size at which the whole headline still fits in `maxLines`.
 * Nothing is ever dropped: a size that would truncate the name is rejected
 * rather than printed short.
 */
function fitHeadline(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
  sizes: number[],
): { size: number; lines: string[] } {
  const whole = text.split(/\s+/).filter(Boolean).join(" ");
  let last = { size: sizes[sizes.length - 1], lines: [text] };
  for (const size of sizes) {
    ctx.font = `900 ${size}px ${SANS}`;
    const measure = (s: string) => ctx.measureText(s).width;
    const lines = wrapLines(measure, text, maxWidth, maxLines);
    last = { size, lines };
    if (lines.join(" ") === whole && lines.every((l) => measure(l) <= maxWidth)) {
      return { size, lines };
    }
  }
  return last;
}

// ---------------------------------------------------------------------------
// The ground
// ---------------------------------------------------------------------------

function rgba(hex: string, alpha: number): string {
  const c = parseHex(hex);
  if (!c) return "rgba(0,0,0,0)";
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
}

/**
 * Read a loaded poster's two colours off its own pixels, through the same
 * quantizer the nightly sync uses on the server. Downscaling to a 16x24 grid
 * in the browser gives the block averages that function expects, and costs one
 * tiny canvas per poster. Null whenever the pixels cannot be read.
 */
function colorsFromImage(img: HTMLImageElement): { colorA: string; colorB: string } | null {
  try {
    const w = 16;
    const h = 24;
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
    return posterColorsFromPixels(rgb, w, h);
  } catch {
    return null;
  }
}

/** Stored colours win; a poster without them supplies its own from its pixels. */
function tintOf(posters: CardPoster[], images: (HTMLImageElement | null)[]): CardTint {
  const filled = posters.map((p, i) => {
    if (parseHex(p.colorA)) return p;
    const img = images[i];
    if (!img) return p;
    const found = colorsFromImage(img);
    return found ? { ...p, colorA: found.colorA, colorB: found.colorB } : p;
  });
  return cardTint(filled);
}

/**
 * Two lamps in the visitor's own colours over the top half, falling to the flat
 * ground before the posters start so the bottom half keeps its contrast. Each
 * lamp burns at the strongest alpha `tintAlpha` allows for that colour.
 */
function paintGround(ctx: CanvasRenderingContext2D, tint: CardTint) {
  ctx.fillStyle = GROUND;
  ctx.fillRect(0, 0, TASTE_CARD_W, TASTE_CARD_H);

  const lamp = (hex: string, cx: number, cy: number, r: number, strength: number) => {
    const alpha = tintAlpha(hex) * strength;
    if (alpha <= 0) return;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, rgba(hex, alpha));
    g.addColorStop(0.34, rgba(hex, alpha * 0.42));
    g.addColorStop(0.64, rgba(hex, alpha * 0.12));
    g.addColorStop(1, rgba(hex, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, TASTE_CARD_W, TASTE_CARD_H);
  };
  lamp(tint.a, 210, 150, 1080, 1);
  lamp(tint.b, 980, 620, 900, 0.82);

  // The floor. Without it a bright poster colour would still be washing over
  // the score chips and the footer a thousand pixels lower down.
  const floor = ctx.createLinearGradient(0, 560, 0, 1240);
  floor.addColorStop(0, "rgba(8,9,11,0)");
  floor.addColorStop(1, "rgba(8,9,11,1)");
  ctx.fillStyle = floor;
  ctx.fillRect(0, 560, TASTE_CARD_W, TASTE_CARD_H - 560);

  // A faint dot texture so a large flat gradient does not band on an OLED.
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  for (let y = 24; y < TASTE_CARD_H; y += 36) {
    for (let x = 24; x < TASTE_CARD_W; x += 36) {
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
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

  const tint = tintOf(posters, images);
  paintGround(ctx, tint);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  const measure = (s: string) => ctx.measureText(s).width;

  // --- The top half: who this is, and why. ---------------------------------

  drawDino(ctx, PAD, 62, 74, BRIGHT);
  ctx.font = `600 32px ${MONO}`;
  ctx.fillStyle = BRIGHT;
  ctx.fillText("BALASAUR", PAD + 96, 118);

  const head = fitHeadline(ctx, o.name, INNER, 2, [136, 124, 112, 100, 88, 78]);
  ctx.font = `900 ${head.size}px ${SANS}`;
  ctx.fillStyle = BRIGHT;
  let y = 330;
  const step = Math.round(head.size * 1.02);
  for (const line of head.lines) {
    ctx.fillText(line, PAD, y);
    y += step;
  }
  y -= step;

  ctx.font = `500 46px ${SANS}`;
  ctx.fillStyle = SENTENCE;
  y += 92;
  for (const line of wrapLines(measure, o.evidence, INNER, 3)) {
    ctx.fillText(line, PAD, y);
    y += 62;
  }
  y -= 62;

  // The counts, directly under the sentence that divides by them: "70% of what
  // you Loved" is checkable against "10 LOVED" without moving your eye.
  const dividerY = y + 96;
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.fillRect(PAD, dividerY, INNER, 1);

  const numberBaseline = dividerY + 104;
  const labelBaseline = numberBaseline + 40;
  const stats: [number, string][] = [
    [o.counts.liked, "LOVED"],
    [o.counts.watched, "WATCHED"],
    [o.counts.want, "WATCHLIST"],
    [o.decades, o.decades === 1 ? "DECADE" : "DECADES"],
  ];
  const col = INNER / 4;
  stats.forEach(([n, label], i) => {
    const cx = PAD + col * i;
    ctx.font = `600 78px ${MONO}`;
    ctx.fillStyle = BRIGHT;
    ctx.fillText(String(n), cx, numberBaseline);
    ctx.font = `500 24px ${MONO}`;
    ctx.fillStyle = DIM;
    ctx.fillText(label, cx, labelBaseline);
  });

  // --- The bottom, laid out upwards from the footer. ------------------------

  const footerY = TASTE_CARD_H - PAD;
  ctx.font = `600 34px ${MONO}`;
  ctx.fillStyle = BRIGHT;
  ctx.fillText(o.url ?? "balasaur.com/taste", PAD, footerY - 40);
  ctx.font = `400 22px ${MONO}`;
  ctx.fillStyle = DIM;
  ctx.fillText("Title data from TMDB and OMDb", PAD, footerY);

  // The disagreement, sitting above the footer.
  let bandBottomLimit = footerY - 150;
  if (o.contrarian) {
    ctx.font = `600 40px ${SANS}`;
    const lines = wrapLines(measure, o.contrarian, INNER - 72, 3);
    const boxH = 56 + lines.length * 54;
    const boxY = footerY - 132 - boxH;
    ctx.fillStyle = PANEL;
    roundRect(ctx, PAD, boxY, INNER, boxH, 8);
    ctx.fill();
    ctx.fillStyle = tint.a;
    ctx.fillRect(PAD, boxY, 7, boxH);
    ctx.fillStyle = BRIGHT;
    lines.forEach((line, i) => ctx.fillText(line, PAD + 44, boxY + 68 + i * 54));
    bandBottomLimit = boxY - 76;
  }

  // The posters, edge to edge: the widest tiles the canvas can give them, and
  // the only element that flexes, so the slack from a one-line versus two-line
  // name lands on the artwork instead of opening a hole in the middle.
  const bandTopLimit = labelBaseline + 96;
  const n = Math.max(posters.length, 1);
  const gap = 4;
  const tileW = Math.floor((TASTE_CARD_W - gap * (n - 1)) / n);
  // A tile taller than 1.5:1 crops the poster sideways, so the ceiling is set
  // where the crop is still under a fifth of the artwork's width.
  const available = Math.max(bandBottomLimit - bandTopLimit, 260);
  const bandH = Math.max(280, Math.min(available, Math.round(tileW * 2), 580));
  const bandTop = Math.round(bandTopLimit + (available - bandH) / 2);

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(0, bandTop - 1, TASTE_CARD_W, 1);
  ctx.fillRect(0, bandTop + bandH, TASTE_CARD_W, 1);

  posters.forEach((p, i) => {
    const px = i * (tileW + gap);
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, bandTop, tileW, bandH);
    ctx.clip();
    ctx.fillStyle = PANEL;
    ctx.fillRect(px, bandTop, tileW, bandH);
    const img = images[i];
    if (img) {
      drawCover(ctx, img, px, bandTop, tileW, bandH);
    } else {
      // No image: the title carries the tile instead of a hole.
      ctx.fillStyle = SENTENCE;
      ctx.font = `600 26px ${SANS}`;
      const lines = wrapLines(measure, p.title, tileW - 36, 5);
      lines.forEach((line, li) => ctx.fillText(line, px + 18, bandTop + 52 + li * 32));
    }
    ctx.restore();

    if (p.score !== undefined) {
      // The score chip is what makes the order on the card explain itself.
      const label = String(p.score);
      ctx.font = `600 32px ${MONO}`;
      const chipW = measure(label) + 30;
      const chipH = 48;
      const chipX = px + 14;
      const chipY = bandTop + bandH - 14 - chipH;
      ctx.fillStyle = "rgba(8,9,11,0.88)";
      roundRect(ctx, chipX, chipY, chipW, chipH, 8);
      ctx.fill();
      ctx.fillStyle = scoreColor(p.score);
      ctx.fillText(label, chipX + 15, chipY + 34);
    }
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
