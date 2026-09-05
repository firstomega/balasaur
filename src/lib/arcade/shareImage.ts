// The share card as an image: a 1080x1350 canvas (the portrait size every
// feed accepts) on the game's hue ground with the game mark, name, day, the
// result squares, the headline, and the play URL. Hand-drawn, no library.
// The mark comes from the same path data GameMark renders, so the card and
// the page cannot drift apart. shareCard() hands the PNG to the OS share
// sheet as a file when the browser supports that and opens it in a new tab
// otherwise.

import { MARK_PATHS, MARK_VIEWBOX } from "@/components/arcade/markPaths";
import { gridCells } from "@/components/arcade/ResultGrid";
import { GAMES } from "./games";
import type { ArcadeHue, GameSlug } from "./types";

export const CARD_W = 1080;
export const CARD_H = 1350;

/** Hue values mirrored from styles.css for the canvas, which cannot read
 *  CSS variables. Ink is the readable text color on the hue. */
export const HUE_HEX: Record<ArcadeHue, { hue: string; ink: string }> = {
  blue: { hue: "#3b82f6", ink: "#ffffff" },
  ice: { hue: "#22d3ee", ink: "#0b0d10" },
  crimson: { hue: "#ef4444", ink: "#ffffff" },
  magenta: { hue: "#e879f9", ink: "#ffffff" },
  gold: { hue: "#f5b82e", ink: "#0b0d10" },
  teal: { hue: "#2dd4bf", ink: "#ffffff" },
  violet: { hue: "#a78bfa", ink: "#ffffff" },
  ruby: { hue: "#f43f5e", ink: "#ffffff" },
  sun: { hue: "#fde047", ink: "#0b0d10" },
  lime: { hue: "#a3e635", ink: "#0b0d10" },
  orange: { hue: "#fb923c", ink: "#ffffff" },
};

const GROUND = "#0b0d10";
const SQUARE_HEX = {
  green: "#9fe6a0",
  red: "#ef4444",
  black: "#262d37",
  yellow: "#e8b552",
} as const;

export interface ShareCardOptions {
  slug: GameSlug;
  /** Day number for the "No. 18" chip. */
  day?: number;
  /** The result claim, e.g. "Solved in 3". */
  title: string;
  /** One line under it, e.g. "Balasaurdle No. 212". */
  subtitle: string;
  /** Emoji rows from share.ts, drawn as colored squares. */
  grid?: string[];
  /** Defaults to balasaur.com/play/<slug>. */
  url?: string;
}

function mix(hex: string, pct: number, withHex: string): string {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(withHex.slice(1), 16);
  const ch = (shift: number) =>
    Math.round((((a >> shift) & 255) * pct + ((b >> shift) & 255) * (100 - pct)) / 100);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

/** Word-wrap one string to a width in the current canvas font. */
export function wrapLines(
  measure: (s: string) => number,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (measure(next) <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = w;
    }
    if (lines.length === maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

function drawMark(
  ctx: CanvasRenderingContext2D,
  slug: GameSlug,
  x: number,
  y: number,
  size: number,
  color: string,
) {
  const scale = size / MARK_VIEWBOX;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  for (const p of MARK_PATHS[slug]) {
    const path = new Path2D(p.d);
    if (p.fill) ctx.fill(path);
    else ctx.stroke(path);
  }
  ctx.restore();
}

async function ensureFonts() {
  try {
    await Promise.all([
      document.fonts.load("900 72px Archivo"),
      document.fonts.load("600 32px 'JetBrains Mono'"),
    ]);
  } catch {
    // system fallback fonts draw instead
  }
}

const SANS = "Archivo, system-ui, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

/** Draw the card and return it as a PNG blob. */
export async function renderShareCard(o: ShareCardOptions): Promise<Blob> {
  const game = GAMES[o.slug];
  const { hue, ink } = HUE_HEX[game.hue];
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  await ensureFonts();

  // Ground: the tile gradient, then a faint dot texture.
  const g = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  g.addColorStop(0, mix(hue, 55, GROUND));
  g.addColorStop(1, mix(hue, 22, GROUND));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  for (let y = 24; y < CARD_H; y += 36) {
    for (let x = 24; x < CARD_W; x += 36) {
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const pad = 88;
  // Mark on a hue block, top left.
  const block = 200;
  ctx.fillStyle = hue;
  roundRect(ctx, pad, pad, block, block, 28);
  ctx.fill();
  drawMark(ctx, o.slug, pad + 28, pad + 28, block - 56, ink);

  // Name and day beside it.
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "alphabetic";
  ctx.font = `900 64px ${SANS}`;
  const nameX = pad + block + 40;
  const nameLines = wrapLines((s) => ctx.measureText(s).width, game.name, CARD_W - pad - nameX, 2);
  nameLines.forEach((line, i) => ctx.fillText(line, nameX, pad + 76 + i * 68));
  if (o.day !== undefined) {
    ctx.font = `600 30px ${MONO}`;
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText(`No. ${o.day}`, nameX, pad + 76 + nameLines.length * 68 + 8);
  }

  // Result squares.
  let y = pad + block + 96;
  const rows = (o.grid ?? []).filter((r) => r.trim().length > 0);
  if (rows.length > 0) {
    const sq = rows.length > 6 ? 52 : 64;
    const gap = 12;
    for (const row of rows) {
      let x = pad;
      for (const cell of gridCells(row)) {
        if (cell.kind === "square") {
          ctx.fillStyle = SQUARE_HEX[cell.tone];
          roundRect(ctx, x, y, sq, sq, 10);
          ctx.fill();
          x += sq + gap;
        } else {
          ctx.fillStyle = "rgba(255,255,255,0.8)";
          ctx.font = `600 ${Math.round(sq * 0.5)}px ${MONO}`;
          ctx.fillText(cell.text, x + 6, y + sq * 0.68);
          x += ctx.measureText(cell.text).width + 18;
        }
      }
      y += sq + gap;
    }
    y += 40;
  }

  // Headline and subtitle.
  ctx.fillStyle = "#ffffff";
  ctx.font = `900 80px ${SANS}`;
  const titleLines = wrapLines((s) => ctx.measureText(s).width, o.title, CARD_W - pad * 2, 3);
  titleLines.forEach((line, i) => ctx.fillText(line, pad, y + 72 + i * 88));
  y += 72 + titleLines.length * 88;
  ctx.font = `500 38px ${SANS}`;
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  const subLines = wrapLines((s) => ctx.measureText(s).width, o.subtitle, CARD_W - pad * 2, 2);
  subLines.forEach((line, i) => ctx.fillText(line, pad, y + 20 + i * 48));

  // URL along the bottom.
  ctx.font = `600 32px ${MONO}`;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText(o.url ?? `balasaur.com${game.path}`, pad, CARD_H - pad);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
}

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

/** True when the browser can put a PNG on the OS share sheet. */
export function canShareFiles(): boolean {
  try {
    if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") return false;
    const probe = new File([new Uint8Array([0])], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

export type ShareCardOutcome = "shared" | "opened" | "blocked" | "failed";

/** Render the card and hand it over: the share sheet with the PNG attached
 *  when supported, else a new tab the player can long-press or save from.
 *  Call it directly from a click handler; the tab is opened before the
 *  render so popup blockers see the gesture. */
export async function shareCard(o: ShareCardOptions): Promise<ShareCardOutcome> {
  const viaSheet = canShareFiles();
  const tab = viaSheet ? null : window.open("", "_blank");
  try {
    const blob = await renderShareCard(o);
    if (viaSheet) {
      const file = new File([blob], `${o.slug}${o.day !== undefined ? `-${o.day}` : ""}.png`, {
        type: "image/png",
      });
      await navigator.share({ files: [file], title: o.title });
      return "shared";
    }
    if (!tab) return "blocked";
    const url = URL.createObjectURL(blob);
    tab.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return "opened";
  } catch {
    tab?.close();
    return "failed";
  }
}
