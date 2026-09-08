// The Taste Card as an image: a 1080x1920 canvas (the size every story and
// short-form feed accepts) on the house ground, with the dino, the archetype,
// the sentence that proves it, four posters with their scores, the counts the
// sentence divides by, and balasaur.com. Hand-drawn, no library.
//
// Nothing here blocks on a network. Posters are fetched with a timeout and a
// failed one draws as a titled tile, so a slow CDN or a blocked image costs a
// thumbnail and never the card.
//
// The wrap and share helpers come from the arcade's share card so the two
// images behave identically in the share sheet.

import { canShareFiles, wrapLines } from "@/lib/arcade/shareImage";
import { tmdbImage } from "@/lib/tmdbImage";
import type { CardPoster } from "@/lib/taste";

export const TASTE_CARD_W = 1080;
export const TASTE_CARD_H = 1920;

/** Poster width requested from TMDB. The preview asks for the same size, so
 *  the canvas draws from an image the browser has already fetched. */
export const POSTER_SIZE = "w342";

// House palette, mirrored from styles.css because a canvas cannot read CSS
// variables. Keep in step with `:root` there.
const GROUND = "#08090b";
const PANEL = "#171b21";
const BORDER = "#262d37";
const BRIGHT = "#ffffff";
const MUTED = "#a1a29b";
const DIM = "#8a887f";
const PRIMARY = "#3b82f6";

const SANS = "Archivo, system-ui, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

/** Score colors, matching ScoreBadge's tiers so a score reads the same here. */
function scoreColor(score: number): string {
  if (score >= 85) return "#6ee7b7";
  if (score >= 70) return "#d9f99d";
  if (score >= 60) return "#fde68a";
  return "#fdba74";
}

// The dino, copied from DinoMark's calm mark (24x24 viewBox) so the card
// carries the same animal as the top bar. If DinoMark's outline changes, this
// changes with it.
const DINO_BODY =
  "M4 17c0-3 2-5 5-5h2c2 0 3-1 3-3 0-2 2-3 4-3 1.5 0 3 1 3 3v2c0 4-3 7-7 7H6c-1 0-2-.5-2-1z";
const DINO_TAIL = "M4 17l-2 2";
const DINO_LEGS = "M8 17v3M12 17v3";

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
  const scale = size / 24;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.75;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke(new Path2D(DINO_BODY));
  ctx.stroke(new Path2D(DINO_TAIL));
  ctx.stroke(new Path2D(DINO_LEGS));
  ctx.beginPath();
  ctx.arc(18, 9, 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * One poster, fetched for the canvas. Resolves null on error or after the
 * timeout, never rejects: the card is drawn either way.
 *
 * crossOrigin is required because a canvas that has drawn a same-origin-opaque
 * image cannot be exported at all. TMDB serves the images with permissive CORS
 * headers, and anything that does not is simply skipped.
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
      document.fonts.load("900 100px Archivo"),
      document.fonts.load("500 40px Archivo"),
      document.fonts.load("600 32px 'JetBrains Mono'"),
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

  const pad = 88;
  const inner = TASTE_CARD_W - pad * 2;
  const measure = (s: string) => ctx.measureText(s).width;

  // Ground, then the ambient glow the rest of the site paints behind a hero,
  // then a faint dot texture so a flat black export does not band.
  ctx.fillStyle = GROUND;
  ctx.fillRect(0, 0, TASTE_CARD_W, TASTE_CARD_H);
  const glow = ctx.createRadialGradient(540, 380, 0, 540, 380, 820);
  glow.addColorStop(0, "rgba(59,130,246,0.20)");
  glow.addColorStop(1, "rgba(59,130,246,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, TASTE_CARD_W, TASTE_CARD_H);
  const under = ctx.createRadialGradient(880, 1620, 0, 880, 1620, 620);
  under.addColorStop(0, "rgba(159,230,160,0.10)");
  under.addColorStop(1, "rgba(159,230,160,0)");
  ctx.fillStyle = under;
  ctx.fillRect(0, 0, TASTE_CARD_W, TASTE_CARD_H);
  ctx.fillStyle = "rgba(255,255,255,0.035)";
  for (let y = 24; y < TASTE_CARD_H; y += 36) {
    for (let x = 24; x < TASTE_CARD_W; x += 36) {
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.textBaseline = "alphabetic";

  // Header: the mark, the name, and what this image is.
  drawDino(ctx, pad, 96, 76, PRIMARY);
  ctx.font = `600 34px ${MONO}`;
  ctx.fillStyle = BRIGHT;
  ctx.fillText("BALASAUR", pad + 100, 158);
  ctx.font = `500 26px ${MONO}`;
  ctx.fillStyle = DIM;
  ctx.textAlign = "right";
  ctx.fillText("TASTE CARD", TASTE_CARD_W - pad, 158);
  ctx.textAlign = "left";

  // The archetype, and the sentence that proves it.
  let y = 380;
  ctx.font = `900 108px ${SANS}`;
  ctx.fillStyle = BRIGHT;
  const nameLines = wrapLines(measure, o.name, inner, 2);
  for (const line of nameLines) {
    ctx.fillText(line, pad, y);
    y += 116;
  }

  y += 18;
  ctx.font = `500 40px ${SANS}`;
  ctx.fillStyle = MUTED;
  for (const line of wrapLines(measure, o.evidence, inner, 3)) {
    ctx.fillText(line, pad, y);
    y += 54;
  }

  // Everything below the headline is laid out from the bottom edge up, so the
  // card composes the same way whether the archetype name takes one line or
  // two: the air lands under the headline instead of inside the data.
  const footerY = TASTE_CARD_H - pad;

  // The disagreement, sitting on the footer.
  // Without a disagreement to sit on, the counts still need daylight above
  // the footer, so the fallback gap is the taller of the two.
  let blockBottom = footerY - 160;
  if (o.contrarian) {
    ctx.font = `600 38px ${SANS}`;
    const lines = wrapLines(measure, o.contrarian, inner - 56, 3);
    const boxH = 52 + lines.length * 50;
    const boxY = footerY - 90 - boxH;
    ctx.fillStyle = PANEL;
    roundRect(ctx, pad, boxY, inner, boxH, 8);
    ctx.fill();
    ctx.fillStyle = PRIMARY;
    ctx.fillRect(pad, boxY, 6, boxH);
    ctx.fillStyle = BRIGHT;
    lines.forEach((line, i) => ctx.fillText(line, pad + 36, boxY + 60 + i * 50));
    blockBottom = boxY - 56;
  }

  // The counts. Every percentage on this card is a percentage of one of them.
  const labelBaseline = blockBottom;
  const numberBaseline = labelBaseline - 38;
  const stats: [number, string][] = [
    [o.counts.liked, "LOVED"],
    [o.counts.watched, "WATCHED"],
    [o.counts.want, "WATCHLIST"],
    [o.decades, o.decades === 1 ? "DECADE" : "DECADES"],
  ];
  const col = inner / 4;
  stats.forEach(([n, label], i) => {
    const cx = pad + col * i;
    ctx.font = `600 68px ${MONO}`;
    ctx.fillStyle = BRIGHT;
    ctx.fillText(String(n), cx, numberBaseline);
    ctx.font = `500 22px ${MONO}`;
    ctx.fillStyle = DIM;
    ctx.fillText(label, cx, labelBaseline);
  });

  const dividerY = numberBaseline - 98;
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(pad, dividerY, inner, 1);

  // Posters, highest score first, each with its score under it. The number is
  // what makes the order on the card explain itself. Fewer than four are
  // widened and centred rather than left hanging off one edge.
  const gap = 24;
  const n = Math.max(posters.length, 1);
  const pw = Math.min(Math.floor((inner - gap * (n - 1)) / n), 300);
  const ph = Math.round(pw * 1.5);
  const rowW = pw * n + gap * (n - 1);
  const rowX = pad + Math.round((inner - rowW) / 2);
  const scoreBaseline = dividerY - 48;
  const posterTop = scoreBaseline - 44 - ph;

  posters.forEach((p, i) => {
    const px = rowX + i * (pw + gap);
    ctx.save();
    roundRect(ctx, px, posterTop, pw, ph, 10);
    ctx.clip();
    ctx.fillStyle = PANEL;
    ctx.fillRect(px, posterTop, pw, ph);
    const img = images[i];
    if (img) {
      drawCover(ctx, img, px, posterTop, pw, ph);
    } else {
      // No image: the title carries the tile instead of a hole.
      ctx.fillStyle = MUTED;
      ctx.font = `600 24px ${SANS}`;
      const lines = wrapLines((t) => ctx.measureText(t).width, p.title, pw - 28, 5);
      lines.forEach((line, li) => ctx.fillText(line, px + 14, posterTop + 46 + li * 30));
    }
    ctx.restore();
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 2;
    roundRect(ctx, px + 1, posterTop + 1, pw - 2, ph - 2, 10);
    ctx.stroke();

    if (p.score !== undefined) {
      ctx.font = `600 30px ${MONO}`;
      ctx.fillStyle = scoreColor(p.score);
      ctx.textAlign = "center";
      ctx.fillText(String(p.score), px + pw / 2, scoreBaseline);
      ctx.textAlign = "left";
    }
  });

  ctx.font = `600 34px ${MONO}`;
  ctx.fillStyle = BRIGHT;
  ctx.fillText(o.url ?? "balasaur.com/taste", pad, footerY - 34);
  ctx.font = `400 22px ${MONO}`;
  ctx.fillStyle = DIM;
  ctx.fillText("Title data from TMDB and OMDb", pad, footerY);

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
