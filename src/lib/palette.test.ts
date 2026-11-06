// Contrast, measured. Every text colour the light ground can put on a surface
// is listed here with the surface it sits on, and held to WCAG's 4.5:1 for
// body text. A pair that only ever carries large display type (24px and up,
// or 19px bold) may be held to 3:1 instead, and says so in its own row.
//
// The values are read out of src/styles.css at test time, so a token edited
// there is measured here in the same commit. The arcade table in games.ts and
// the swatch table in posterSwatch.ts mirror the CSS for code that cannot read
// a CSS variable (the canvas share card, the database), and both are checked
// against it: three copies of a colour that drift apart are three colours.

import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HUE_HEX, HUE_INK } from "./arcade/games";

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(HERE, "..", "styles.css"), "utf8");

const BODY = 4.5;
const LARGE = 3;

/** Every custom property declared in :root, with var() references resolved. */
function rootVars(css: string): Map<string, string> {
  const start = css.indexOf(":root {");
  const body = css.slice(start, css.indexOf("\n}", start));
  const raw = new Map<string, string>();
  for (const m of body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) raw.set(m[1], m[2].trim());
  const resolve = (v: string, depth = 0): string => {
    const ref = /^var\(--([a-z0-9-]+)\)$/.exec(v);
    if (!ref || depth > 8) return v;
    const next = raw.get(ref[1]);
    if (next === undefined) throw new Error(`--${ref[1]} is referenced but not declared`);
    return resolve(next, depth + 1);
  };
  const out = new Map<string, string>();
  for (const [k, v] of raw) out.set(k, resolve(v));
  return out;
}

const VARS = rootVars(CSS);

function token(name: string): string {
  const v = VARS.get(name);
  if (!v) throw new Error(`--${name} is not declared in :root`);
  if (!/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`--${name} is ${v}, expected #rrggbb`);
  return v.toLowerCase();
}

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** color-mix(in srgb, <fill> <pct>%, <base>), the way a row tint is painted. */
function mix(fill: string, pct: number, base: string): string {
  const a = rgb(fill);
  const b = rgb(base);
  return (
    "#" +
    a
      .map((c, i) => Math.round((c * pct + b[i] * (100 - pct)) / 100))
      .map((c) => c.toString(16).padStart(2, "0"))
      .join("")
  );
}

const SWATCHES = [
  "red",
  "orange",
  "gold",
  "lime",
  "green",
  "teal",
  "sky",
  "blue",
  "violet",
  "pink",
  "wine",
  "rust",
  "navy",
  "noir",
] as const;

/** The light tint a swatch paints behind a row of ordinary text. */
const TINT_PCT = 13;

type Pair = { what: string; fg: string; bg: string; min: number };

function pairs(): Pair[] {
  const paper = token("paper");
  const wash = token("wash");
  const out: Pair[] = [];
  const both = (what: string, fg: string, min = BODY) => {
    out.push({ what: `${what} on paper`, fg: token(fg), bg: paper, min });
    out.push({ what: `${what} on the wash`, fg: token(fg), bg: wash, min });
  };

  // The ground and its text.
  both("ink", "ink");
  both("body text", "foreground");
  both("muted ink", "ink-muted");
  both("dim ink", "ink-dim");
  both("rating", "rating");
  both("movie", "media-movie");
  both("show", "media-tv");
  both("book", "media-book");
  both("podcast", "media-podcast");
  both("warning", "warn");
  both("error", "destructive");
  out.push({
    what: "ink on a hovered control",
    fg: token("ink"),
    bg: token("wash-strong"),
    min: BODY,
  });
  out.push({
    what: "muted ink on a hovered control",
    fg: token("ink-muted"),
    bg: token("wash-strong"),
    min: BODY,
  });
  out.push({
    what: "primary button label",
    fg: token("primary-foreground"),
    bg: token("primary"),
    min: BODY,
  });
  out.push({ what: "error button label", fg: paper, bg: token("destructive"), min: BODY });

  // An accent on its own light tint: an active control is bg-<accent>/10 or
  // /15 with text-<accent>. 15% is the heavier of the two, so it is the floor.
  for (const t of [
    "rating",
    "warn",
    "destructive",
    "media-movie",
    "media-tv",
    "status-watchlist",
    "status-seen",
    "status-loved",
    "status-disliked",
    "status-never",
  ]) {
    out.push({
      what: `${t} on its 15% tint`,
      fg: token(t),
      bg: mix(token(t), 15, paper),
      min: BODY,
    });
    out.push({ what: `white on ${t}`, fg: paper, bg: token(t), min: BODY });
  }
  both("watchlist", "status-watchlist");
  both("seen", "status-seen");
  both("not for me", "status-disliked");
  both("never", "status-never");

  // The score sticker: a black number on white, wherever it sits.
  out.push({ what: "sticker number", fg: token("sticker-ink"), bg: token("sticker"), min: BODY });

  // Poster swatches: the tile's own ink, and ordinary text on the light tint.
  for (const s of SWATCHES) {
    const fill = token(`swatch-${s}`);
    out.push({ what: `${s} tile ink`, fg: token(`swatch-${s}-ink`), bg: fill, min: BODY });
    const tint = mix(fill, TINT_PCT, paper);
    out.push({ what: `ink on the ${s} tint`, fg: token("ink"), bg: tint, min: BODY });
    out.push({ what: `muted ink on the ${s} tint`, fg: token("ink-muted"), bg: tint, min: BODY });
  }

  return out;
}

describe("palette contrast", () => {
  it("holds every text pair the light ground can produce at its floor", () => {
    const failing = pairs()
      .map((p) => ({ ...p, ratio: contrast(p.fg, p.bg) }))
      .filter((p) => p.ratio < p.min)
      .map((p) => `${p.what}: ${p.fg} on ${p.bg} = ${p.ratio.toFixed(2)}, needs ${p.min}`);
    expect(failing.join("\n")).toBe("");
  });

  it("states a floor for every pair, and only uses 3:1 on purpose", () => {
    // No pair is large-display-only today. A row that drops to LARGE must name
    // the display size it is limited to in its `what`.
    const large = pairs().filter((p) => p.min === LARGE);
    for (const p of large) expect(`${p.what}: ${/display/.test(p.what)}`).toBe(`${p.what}: true`);
  });

  it("measures known values the way WCAG does", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    // The prototype's rust with white: just under the floor, which is why the
    // fill was darkened.
    expect(contrast("#c9521d", "#ffffff")).toBeLessThan(BODY);
    expect(mix("#000000", 50, "#ffffff")).toBe("#808080");
  });

  it("keeps the arcade table in games.ts equal to the CSS swatches", () => {
    for (const h of Object.keys(HUE_HEX) as (keyof typeof HUE_HEX)[]) {
      expect(`${h} ${HUE_HEX[h].toLowerCase()}`).toBe(`${h} ${token(`swatch-${h}`)}`);
      expect(`${h} ink ${HUE_INK[h].toLowerCase()}`).toBe(`${h} ink ${token(`swatch-${h}-ink`)}`);
    }
  });

  // The swatch table lives in posterSwatch.ts, which the data side owns. It is
  // loaded by path so this file does not fail to compile on a checkout where
  // that table has not landed yet; once it exists, it must match the CSS.
  const swatchFile = join(HERE, "posterSwatch.ts");
  if (existsSync(swatchFile))
    it("keeps the swatch table in posterSwatch.ts equal to the CSS", async () => {
      const mod = (await import(swatchFile)) as {
        SWATCH_KEYS: readonly string[];
        SWATCHES: Record<string, { fill: string; ink: string }>;
      };
      expect([...mod.SWATCH_KEYS]).toEqual([...SWATCHES]);
      for (const s of SWATCHES) {
        const row = mod.SWATCHES[s];
        expect(`${s} fill ${row.fill.toLowerCase()}`).toBe(`${s} fill ${token(`swatch-${s}`)}`);
        expect(`${s} ink ${row.ink.toLowerCase()}`).toBe(`${s} ink ${token(`swatch-${s}-ink`)}`);
        expect(`${s} ${contrast(row.ink, row.fill) >= BODY}`).toBe(`${s} true`);
      }
    });
});
