// Renders the arcade's share cards: public/og-play.png for the hub and
// public/og-play-<slug>.png for each game, 1200x630, from one inline HTML
// template. Each card is the game's face: hue ground, the mark, the name in
// the display weight, the hook, and the URL. Run once per registry change:
//
//   node scripts/og-arcade.mjs
//
// Reads the mark paths, names, hooks and hues straight out of the TypeScript
// sources (as text, so the script needs no TS loader) and the self-hosted
// fonts from src/fonts, so a card can never disagree with the site.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "public");
const CHROMIUM = process.env.OG_CHROMIUM ?? "/opt/pw-browsers/chromium";
const W = 1200;
const H = 630;
const INK_DARK = "#0b0d10";

// ---------------------------------------------------------------------------
// Source extraction. The registry objects are plain literals; lift them out
// of the TS text and evaluate them.
// ---------------------------------------------------------------------------

function literal(source, name) {
  const re = new RegExp(`export const ${name}\\b[^=]*=\\s*(\\{[\\s\\S]*?\\n\\});`);
  const m = re.exec(source);
  if (!m) throw new Error(`could not find ${name}`);
  return new Function(`return (${m[1]});`)();
}

const gamesSrc = readFileSync(resolve(ROOT, "src/lib/arcade/games.ts"), "utf8").replace(
  /\bLAUNCHED\b/g,
  '"0000-00-00"',
);
const GAMES = literal(gamesSrc, "GAMES");
const HUE_HEX = literal(gamesSrc, "HUE_HEX");
const HUE_INK = literal(gamesSrc, "HUE_INK");
const HUB_SECTIONS = new Function(
  `return (${/export const HUB_SECTIONS[^=]*=\s*(\[[\s\S]*?\n\]);/.exec(gamesSrc)[1]});`,
)();
const MARK_PATHS = literal(
  readFileSync(resolve(ROOT, "src/components/arcade/markPaths.ts"), "utf8"),
  "MARK_PATHS",
);

const font = (file) =>
  `url(data:font/woff2;base64,${readFileSync(resolve(ROOT, "src/fonts", file)).toString("base64")}) format("woff2")`;
const ARCHIVO = font("archivo-latin-var.woff2");
const MONO = font("jetbrains-mono-latin-var.woff2");

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function mark(slug, size, color) {
  const paths = MARK_PATHS[slug]
    .map(
      (p) =>
        `<path d="${p.d}"${p.fill ? ' fill="currentColor"' : ""}${p.fill ? ' stroke-width="1.75"' : ""}/>`,
    )
    .join("");
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="color:${color};display:block">${paths}</svg>`;
}

// The same dino as src/components/balasaur/DinoMark.tsx.
function dino(size, color) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="color:${color};display:block"><path d="M4 17c0-3 2-5 5-5h2c2 0 3-1 3-3 0-2 2-3 4-3 1.5 0 3 1 3 3v2c0 4-3 7-7 7H6c-1 0-2-.5-2-1z"/><path d="M4 17l-2 2"/><path d="M8 17v3M12 17v3"/><circle cx="18" cy="9" r="0.6" fill="currentColor" stroke="none"/></svg>`;
}

const BASE_CSS = `
  @font-face { font-family: "Archivo"; font-weight: 400 900; src: ${ARCHIVO}; }
  @font-face { font-family: "JetBrains Mono"; font-weight: 400 600; src: ${MONO}; }
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${INK_DARK}; }
  body { font-family: "Archivo", system-ui, sans-serif; color: #fff; -webkit-font-smoothing: antialiased; }
  .card { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; }
  .dots { position: absolute; inset: 0; background-image: radial-gradient(rgba(255,255,255,0.09) 1.5px, transparent 1.5px); background-size: 28px 28px; }
  .grid { position: absolute; inset: 0; opacity: 0.06; background-image: linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px); background-size: 48px 48px; }
  .mono { font-family: "JetBrains Mono", ui-monospace, monospace; }
  .brand { position: absolute; top: 44px; left: 56px; display: flex; align-items: center; gap: 12px; font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 26px; letter-spacing: -0.02em; color: #fff; }
  .url { position: absolute; bottom: 44px; left: 56px; font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 24px; color: rgba(255,255,255,0.72); }
  .name { font-weight: 900; letter-spacing: -0.02em; line-height: 0.96; }
`;

function gameCard(game) {
  const hue = HUE_HEX[game.hue];
  const ink = HUE_INK[game.hue];
  const nameSize = game.name.length > 14 ? 88 : 104;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
    .card { background: linear-gradient(160deg, color-mix(in oklab, ${hue} 55%, ${INK_DARK}), color-mix(in oklab, ${hue} 22%, ${INK_DARK})); }
    .markbox { position: absolute; right: 64px; top: 50%; transform: translateY(-50%); width: 330px; height: 330px; display: flex; align-items: center; justify-content: center; border-radius: 40px; background: color-mix(in oklab, ${hue} 18%, rgba(11,13,16,0.65)); border: 2px solid rgba(255,255,255,0.14); filter: drop-shadow(0 20px 50px rgba(0,0,0,0.45)); }
    .text { position: absolute; left: 56px; top: 50%; transform: translateY(-50%); width: 720px; padding-bottom: 20px; }
    .pill { display: inline-flex; align-items: center; gap: 10px; padding: 8px 18px; border-radius: 999px; background: ${hue}; color: ${ink}; font-size: 20px; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 600; }
    .hook { margin-top: 26px; font-size: 38px; line-height: 1.22; color: rgba(255,255,255,0.86); max-width: 640px; }
  </style></head><body><div class="card"><div class="dots"></div>
    <div class="brand">${dino(30, "#fff")}<span>balasaur</span></div>
    <div class="text">
      <div class="pill mono">Daily <span style="opacity:.55">/</span> ${esc(game.minutes)}</div>
      <div class="name" style="font-size:${nameSize}px;margin-top:22px">${esc(game.name)}</div>
      <div class="hook">${esc(game.hook)}</div>
    </div>
    <div class="markbox">${mark(game.slug, 230, hue)}</div>
    <div class="url">balasaur.com${esc(game.path)}</div>
  </div></body></html>`;
}

function hubCard() {
  const tonight = HUB_SECTIONS[0].slugs;
  const glow = tonight
    .map((slug, i) => {
      const hue = HUE_HEX[GAMES[slug].hue];
      const at = ["10% 0%", "95% 100%", "70% 5%"][i];
      return `radial-gradient(55% 75% at ${at}, color-mix(in oklab, ${hue} 30%, transparent), transparent 70%)`;
    })
    .join(", ");
  const cluster = tonight
    .map((slug) => {
      const hue = HUE_HEX[GAMES[slug].hue];
      return `<span class="chip" style="background:color-mix(in oklab, ${hue} 24%, ${INK_DARK})">${mark(slug, 44, hue)}</span>`;
    })
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
    .card { background-image: ${glow}; background-color: ${INK_DARK}; }
    .row { position: absolute; left: 56px; top: 130px; display: flex; align-items: center; }
    .chip { display: inline-flex; width: 84px; height: 84px; align-items: center; justify-content: center; border-radius: 999px; border: 2px solid rgba(255,255,255,0.16); margin-left: -14px; }
    .chip:first-child { margin-left: 0; background: rgba(255,255,255,0.06); }
    .text { position: absolute; left: 56px; top: 236px; width: 1040px; }
    .h1 { font-size: 86px; }
    .sub { margin-top: 26px; font-size: 34px; color: rgba(255,255,255,0.72); }
  </style></head><body><div class="card"><div class="grid"></div>
    <div class="brand">${dino(30, "#fff")}<span>balasaur</span></div>
    <div class="row"><span class="chip">${dino(44, HUE_HEX.blue)}</span>${cluster}</div>
    <div class="text">
      <div class="h1 name">Eleven movie games.<br>New at midnight.</div>
      <div class="sub">Same board for everyone. Share it without spoiling it.</div>
    </div>
    <div class="url" style="left:auto;right:56px">balasaur.com/play</div>
  </div></body></html>`;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });

  const jobs = [
    { file: "og-play.png", html: hubCard() },
    ...Object.values(GAMES).map((g) => ({ file: `og-play-${g.slug}.png`, html: gameCard(g) })),
  ];
  for (const job of jobs) {
    await page.setContent(job.html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: W, height: H } });
    writeFileSync(resolve(OUT, job.file), png);
    console.log(`wrote public/${job.file} (${Math.round(png.length / 1024)} KB)`);
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
