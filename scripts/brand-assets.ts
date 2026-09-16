// Renders the three brand PNGs in public/ from the one drawing that defines
// the mark, src/components/balasaur/DinoMark.tsx:
//
//   public/favicon.png          64x64   browser tab
//   public/apple-touch-icon.png 180x180 iOS home screen
//   public/og-default.png       1200x630 the card every page unfurls with
//                                        unless it has poster art of its own
//
// Run after any change to the mark or to the tagline:
//
//   bun scripts/brand-assets.ts
//
// The mark is imported, not copied. The previous icons were a lowercase "b"
// with a blue dot, drawn by hand somewhere off to the side, on a product named
// Balasaur; the previous share card was three grey rectangles standing in for
// posters and a title count that was already sixteen thousand titles out of
// date. Both failure modes have the same cause: art baked once, by hand, from
// a source that then moved. Nothing here is typed twice. The tagline is read
// out of src/lib/seo.ts, so the card cannot disagree with the meta
// description, and there is no count on the card at all, because a number kept
// inside an image goes stale the moment the catalog grows.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import {
  DINO_MARK_VIEWBOX,
  dinoPaths,
  dinoWeight,
  type DinoMood,
} from "../src/components/balasaur/DinoMark";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "public");
const CHROMIUM = process.env.OG_CHROMIUM ?? "/opt/pw-browsers/chromium";

// The three tokens the mark is allowed to use, lifted from src/styles.css:
// --primary, --primary-foreground (the ink the site already declares readable
// on that blue), and --background.
const BRAND = "#3b82f6";
const ON_BRAND = "#0b0e13";
const INK = "#08090b";

// ---------------------------------------------------------------------------
// The mark, as markup
// ---------------------------------------------------------------------------

export interface DinoSvgOptions {
  mood?: DinoMood;
  /** Defaults to the component's own rule: solid at 56px and up. */
  filled?: boolean;
  /** The two-value near-side/far-side pass. Defaults to `filled`. */
  depth?: boolean;
}

/**
 * `dinoPaths()` output as an SVG string, for the places that render outside
 * React: this script and scripts/og-arcade.mjs. It is a serializer and nothing
 * else. No path data lives here, and src/components/balasaur/DinoMark.test.ts
 * fails if any file outside DinoMark.tsx starts carrying some.
 */
export function dinoSvg(size: number, color: string, opts: DinoSvgOptions = {}): string {
  const filled = opts.filled ?? size >= 56;
  const paths = dinoPaths(opts.mood ?? "calm", filled, dinoWeight(size), opts.depth ?? filled);
  const body = paths
    .map((p) => {
      const ink = p.ink == null ? "" : ` opacity="${p.ink}"`;
      return p.fill
        ? `<path d="${p.d}" fill="currentColor"${p.evenOdd ? ' fill-rule="evenodd"' : ""} stroke="none"${ink}/>`
        : `<path d="${p.d}" stroke-width="${p.width}"${ink}/>`;
    })
    .join("");
  return `<svg width="${size}" height="${size}" viewBox="${DINO_MARK_VIEWBOX}" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" style="color:${color};display:block">${body}</svg>`;
}

// ---------------------------------------------------------------------------
// Copy, read from the module that also feeds the meta tags
// ---------------------------------------------------------------------------

function stringConst(source: string, name: string): string {
  const m = new RegExp(`export const ${name}\\s*=\\s*"([^"]*)"`).exec(source);
  if (!m) throw new Error(`could not read ${name} from src/lib/seo.ts`);
  return m[1];
}

const seoSrc = readFileSync(resolve(ROOT, "src/lib/seo.ts"), "utf8");
const TAGLINE = stringConst(seoSrc, "SITE_TAGLINE");
const PROOF = stringConst(seoSrc, "SITE_PROOF");

const font = (file: string) =>
  `url(data:font/woff2;base64,${readFileSync(resolve(ROOT, "src/fonts", file)).toString("base64")}) format("woff2")`;
const ARCHIVO = font("archivo-latin-var.woff2");
const MONO = font("jetbrains-mono-latin-var.woff2");

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

/**
 * A square app icon: the mark solid, in the site's own ink-on-blue pair, on a
 * full-bleed tile.
 *
 * Full-bleed and opaque on purpose. iOS paints its own mask over an Apple
 * touch icon and renders transparent pixels black, and a favicon with a dark
 * transparent ground disappears into a dark tab strip. The blue tile is the
 * one version that survives both.
 *
 * `depth` is off on the small icon. The two-value pass puts the tail and the
 * far leg at 0.55 of the colour, which is depth at 180px and dirt at the 16px
 * a favicon is actually drawn at.
 */
function iconPage(size: number, depth: boolean): string {
  const markSize = Math.round(size * 0.74);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; }
    html, body { width: ${size}px; height: ${size}px; overflow: hidden; }
    body { display: flex; align-items: center; justify-content: center; background: ${BRAND}; }
  </style></head><body>${dinoSvg(markSize, ON_BRAND, { filled: true, depth })}</body></html>`;
}

const W = 1200;
const H = 630;

/**
 * The default share card. Built to the same plan as the eleven arcade cards in
 * scripts/og-arcade.mjs (brand lockup top left, claim on the left, one big
 * mark in a tile on the right, URL bottom left) so a pasted balasaur.com link
 * and a pasted balasaur.com/play link read as the same site.
 *
 * Flat fills and a repeating dot texture, no soft gradient: a smooth gradient
 * roughly triples the PNG and a share card that unfurls slowly is a share card
 * nobody sees.
 *
 * No number on it. The headline is the tagline, verbatim from src/lib/seo.ts.
 */
function sharePage(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: "Archivo"; font-weight: 400 900; src: ${ARCHIVO}; }
    @font-face { font-family: "JetBrains Mono"; font-weight: 400 600; src: ${MONO}; }
    * { box-sizing: border-box; margin: 0; }
    html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${INK}; }
    body { font-family: "Archivo", system-ui, sans-serif; color: #fff; -webkit-font-smoothing: antialiased; }
    .card { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; }
    .dots { position: absolute; inset: 0; background-image: radial-gradient(rgba(255,255,255,0.09) 1.5px, transparent 1.5px); background-size: 28px 28px; }
    .brand { position: absolute; top: 44px; left: 56px; display: flex; align-items: center; gap: 12px; font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 26px; letter-spacing: -0.02em; }
    .url { position: absolute; bottom: 44px; left: 56px; font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 24px; color: rgba(255,255,255,0.72); }
    .text { position: absolute; left: 56px; top: 50%; transform: translateY(-50%); width: 772px; }
    .h1 { font-weight: 900; letter-spacing: -0.025em; line-height: 1.0; text-wrap: balance; font-size: 76px; }
    .sub { margin-top: 26px; max-width: 620px; font-size: 29px; line-height: 1.3; text-wrap: balance; color: rgba(255,255,255,0.72); }
    .markbox { position: absolute; right: 56px; top: 50%; transform: translateY(-50%); width: 264px; height: 264px; display: flex; align-items: center; justify-content: center; border-radius: 34px; background: #101725; border: 2px solid rgba(255,255,255,0.13); }
  </style></head><body><div class="card">
    <div class="dots"></div>
    <div class="brand">${dinoSvg(30, "#fff", { filled: true, depth: false })}<span>balasaur</span></div>
    <div class="text">
      <div class="h1" id="h1">${esc(TAGLINE)}.</div>
      <div class="sub">${esc(PROOF)}</div>
    </div>
    <div class="markbox">${dinoSvg(186, BRAND)}</div>
    <div class="url">balasaur.com</div>
  </div></body></html>`;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROMIUM });

  const icons = [
    { file: "favicon.png", size: 64, depth: false },
    { file: "apple-touch-icon.png", size: 180, depth: true },
  ];
  for (const icon of icons) {
    const page = await browser.newPage({
      viewport: { width: icon.size, height: icon.size },
      deviceScaleFactor: 1,
    });
    await page.setContent(iconPage(icon.size, icon.depth), { waitUntil: "load" });
    const png = await page.screenshot({ type: "png" });
    writeFileSync(resolve(OUT, icon.file), png);
    console.log(`wrote public/${icon.file} (${icon.size}px, ${Math.round(png.length / 1024)} KB)`);
    await page.close();
  }

  const share = await browser.newPage({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
  });
  await share.setContent(sharePage(), { waitUntil: "load" });
  await share.evaluate(() => document.fonts.ready);
  // The headline is set to fit rather than to a fixed size: the largest size at
  // which the tagline still lands on two lines. A card with a headline baked to
  // a fixed size is the same trap as a card with a title count baked into it,
  // one word later. Line height is exactly 1, so the rendered height divided by
  // the size is the line count.
  const headlineSize = await share.evaluate(() => {
    const el = document.getElementById("h1")!;
    let size = 76;
    const twoLines = () => {
      el.style.fontSize = `${size}px`;
      return el.getBoundingClientRect().height <= size * 2.05;
    };
    while (size > 34 && !twoLines()) size -= 2;
    return size;
  });
  const card = await share.screenshot({
    type: "png",
    clip: { x: 0, y: 0, width: W, height: H },
  });
  writeFileSync(resolve(OUT, "og-default.png"), card);
  console.log(
    `wrote public/og-default.png (${W}x${H}, headline ${headlineSize}px, ${Math.round(card.length / 1024)} KB)`,
  );

  await browser.close();
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
