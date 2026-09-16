// Style ratchet, run as a test so it rides `bun test src` locally and in CI.
//
// WHY THIS EXISTS. This repo's design audit counted the same drift twice,
// thirteen days apart. Between the two counts, arbitrary font sizes went from
// 24 to 31, hardcoded hex literals in components went from 19 to 155, and
// hardcoded page widths went from 16 to 24. Both counts were correct and
// neither changed anything, because a number written in a markdown file cannot
// stop the next commit. This file can.
//
// WHAT IT DOES. It walks src/, extracts six design-vocabulary properties out
// of class strings and inline styles, counts them per file, and compares them
// against styleLint.baseline.json. It does NOT fail on what already ships. It
// fails when a count goes UP, and it names the file, the line and the value so
// the author can see what they just wrote.
//
// THE FAILURE MODE, SAID OUT LOUD. A ratchet that is only ever turned up is a
// freeze, and a freeze is a lie that takes a year to notice. This file is
// worth exactly what the baseline is worth. When you delete arbitrary values,
// run `bun run style:baseline` in the same change that deletes them, so the
// new floor is the one that gets defended. If you find yourself regenerating
// the baseline to make a red test go green without having removed anything,
// that is the moment this file stopped working, and deleting it would then be
// more honest than keeping it.
//
// THE TOKENS ARE PARSED, NOT LISTED. The legal colour names come out of
// src/styles.css at test time. Add a --color-* there and it is legal here in
// the same commit, with no list to keep in sync.

import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const STYLES = join(ROOT, "styles.css");
const BASELINE_PATH = join(HERE, "styleLint.baseline.json");
const WRITE = process.env.STYLE_BASELINE === "write";

/** The six properties that carry visual identity. Dimensions are deliberately
 *  not here: a fixed poster width is a legitimate value, flagging it would
 *  train the author to ignore the test, and an ignored ratchet is worse than
 *  no ratchet. Container width is tracked because a page measure is a design
 *  decision; `w-[168px]` on a poster is not. */
const PROPERTIES = ["fontSize", "radius", "duration", "easing", "hex", "containerWidth"] as const;
type Property = (typeof PROPERTIES)[number];

type Finding = { file: string; property: Property; value: string; line: number };
type Baseline = { totals: Record<string, number>; files: Record<string, Record<string, number>> };

// ---------------------------------------------------------------------------
// Walking
// ---------------------------------------------------------------------------

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      out.push(...sourceFiles(p));
      continue;
    }
    if (!/\.tsx?$/.test(name)) continue;
    if (name.includes(".test.") || name.endsWith(".gen.ts") || name.endsWith(".d.ts")) continue;
    out.push(p);
  }
  return out;
}

const rel = (p: string) => "src" + p.slice(ROOT.length).split(sep).join("/");

// ---------------------------------------------------------------------------
// Extracting class tokens
// ---------------------------------------------------------------------------

/** A Tailwind utility as written: optional variants, a utility, an optional
 *  arbitrary value in brackets, an optional /opacity. */
const CLASS_TOKEN =
  /^(?:(?:[a-z0-9@_.-]+|\[[^\]]+\]|group-[a-z-]+|peer-[a-z-]+):)*-?[a-z][a-zA-Z0-9-]*(?:-\[[^\]]+\])?(?:\/[a-zA-Z0-9.[\]-]+)?$/;
const VARIANTS = /^(?:(?:[a-z0-9@_.-]+|\[[^\]]+\]|group-[a-z-]+|peer-[a-z-]+):)*/;
const STRING_LITERAL =
  /"([^"\\\n]*(?:\\.[^"\\\n]*)*)"|'([^'\\\n]*(?:\\.[^'\\\n]*)*)'|`([^`\\]*(?:\\.[^`\\]*)*)`/g;

/** Every string literal in a file, with the line it starts on. */
function stringLiterals(src: string): { body: string; line: number }[] {
  const out: { body: string; line: number }[] = [];
  let m: RegExpExecArray | null;
  STRING_LITERAL.lastIndex = 0;
  while ((m = STRING_LITERAL.exec(src))) {
    const body = m[1] ?? m[2] ?? m[3] ?? "";
    if (!body.trim()) continue;
    out.push({ body, line: src.slice(0, m.index).split("\n").length });
  }
  return out;
}

/** Utilities common enough that two of them in one string means the string is
 *  a class list and not English. Without this gate a sentence containing
 *  "a text-based clue" reads as a broken `text-*` colour. */
const UNMISTAKABLE =
  /^(?:flex|grid|block|inline|inline-flex|inline-block|hidden|absolute|relative|fixed|sticky|truncate|uppercase|lowercase|capitalize|shrink-0|grow|isolate|contents|antialiased|tabular-nums|select-none|pointer-events-none|overflow-hidden|whitespace-nowrap)$|^(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|w|h|gap|gap-x|gap-y|top|left|right|bottom|inset|z|opacity|scale|rotate|order|basis|col-span|row-span|leading|tracking|min-w|max-w|min-h|max-h|space-x|space-y|size)-|^(?:text|bg|border|ring|rounded|font|items|justify|self|place|content|shadow|duration|ease|transition|animate|cursor|object|aspect|grid-cols|grid-rows|line-clamp|backdrop|blur)(?:-|$)/;

function looksLikeClassList(tokens: string[]): boolean {
  let strong = 0;
  for (const t of tokens) {
    const bare = t.replace(VARIANTS, "");
    if (t !== bare || bare.includes("-[") || UNMISTAKABLE.test(bare)) strong++;
    if (strong >= 2) return true;
  }
  return false;
}

/** Split a string literal into candidate utility tokens, keeping line numbers
 *  for multi-line template literals. */
function tokensOf(lit: { body: string; line: number }): { token: string; line: number }[] {
  const out: { token: string; line: number }[] = [];
  lit.body.split("\n").forEach((ln, i) => {
    for (const t of ln.split(/\s+/)) {
      if (t && CLASS_TOKEN.test(t)) out.push({ token: t, line: lit.line + i });
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// The six properties
// ---------------------------------------------------------------------------

/** A CSS length. `text-[#8d8472]` and `text-[var(--game)]` are colours, not
 *  font sizes, and must not be counted as one. */
const LENGTH = /^-?[0-9.]+(px|rem|em|ch|pt|vw|vh|%)?$/;
const ROUNDED = /^rounded(?:-(?:t|r|b|l|s|e|tl|tr|bl|br|ss|se|ee|es))?$/;
const HEX = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b/g;

function scanFile(path: string, src: string): Finding[] {
  const file = rel(path);
  const found: Finding[] = [];

  for (const lit of stringLiterals(src)) {
    for (const { token, line } of tokensOf(lit)) {
      const arbitrary = /^([a-z-]+)-\[(.+)\]$/.exec(token.replace(VARIANTS, ""));
      if (!arbitrary) continue;
      const [whole, util, value] = arbitrary;
      const add = (property: Property) => found.push({ file, property, value: whole, line });
      if (util === "text" && LENGTH.test(value)) add("fontSize");
      else if (ROUNDED.test(util)) add("radius");
      else if (util === "duration") add("duration");
      else if (util === "ease") add("easing");
      else if (util === "max-w" && LENGTH.test(value) && !value.endsWith("%"))
        add("containerWidth");
    }
  }

  // Inline styles and raw CSS strings sidestep the class scanner entirely, and
  // they are where the arcade kept re-inventing its own timing.
  src.split("\n").forEach((ln, i) => {
    const line = i + 1;
    for (const m of ln.matchAll(/\bfontSize\s*:/g))
      found.push({ file, property: "fontSize", value: `style ${m[0]}`, line });
    for (const m of ln.matchAll(/\bborderRadius\s*:/g))
      found.push({ file, property: "radius", value: `style ${m[0]}`, line });
    for (const m of ln.matchAll(/\b(transitionDuration|animationDuration)\s*:/g))
      found.push({ file, property: "duration", value: `style ${m[1]}`, line });
    for (const m of ln.matchAll(/cubic-bezier\(/g))
      found.push({ file, property: "easing", value: m[0] + ")", line });
    for (const m of ln.matchAll(HEX)) found.push({ file, property: "hex", value: m[0], line });
  });

  return found;
}

// ---------------------------------------------------------------------------
// Colour classes must resolve to a token declared in styles.css
// ---------------------------------------------------------------------------

function declaredColorTokens(css: string): Set<string> {
  const out = new Set<string>();
  for (const m of css.matchAll(/--color-([a-z0-9-]+)\s*:/g)) out.add(m[1]);
  return out;
}

/** Tailwind's own palette, which stays reachable because @theme clears only
 *  --radius-*, not --color-*. */
const PALETTE = new Set([
  "inherit",
  "current",
  "transparent",
  "black",
  "white",
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
]);

/** For each utility that can take a colour, the values it takes that are not
 *  colours. Anything left over is being read as a colour name, so it has to
 *  resolve to a token or it emits no rule at all and silently inherits. That
 *  is what `text-text` did on 28 elements before the token landed. */
const NOT_A_COLOR: Record<string, RegExp> = {
  bg: /^(?:none|fixed|local|scroll|auto|cover|contain|top|bottom|left|right|center|repeat|no-repeat|repeat-x|repeat-y|repeat-round|repeat-space|origin|clip|size|blend|gradient|linear|radial|conic)\b/,
  text: /^(?:xs|sm|base|lg|xl|[2-9]xl|left|center|right|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip|shadow)$/,
  border:
    /^(?:(?:x|y|t|r|b|l|s|e)(?:-[0-9]+)?$|[0-9]|solid|dashed|dotted|double|hidden|none|collapse|separate|spacing)/,
  ring: /^(?:[0-9]|inset|offset)/,
  outline: /^(?:[0-9]|none|hidden|solid|dashed|dotted|double|offset)/,
  fill: /^(?:none|mode-)/,
  stroke: /^(?:none|[0-9])/,
  divide: /^(?:x|y|solid|dashed|dotted|double|none|reverse)/,
  decoration: /^(?:[0-9]|solid|dashed|dotted|double|wavy|none|auto|from-font|slice|clone)/,
  shadow: /^(?:[0-9]?xs|sm|md|lg|xl|[0-9]xl|inner|none|initial)$/,
  caret: /^$/,
  placeholder: /^$/,
  accent: /^auto$/,
};

function unresolvedColorClasses(path: string, src: string, tokens: Set<string>): string[] {
  const file = rel(path);
  const hits: string[] = [];
  for (const lit of stringLiterals(src)) {
    const toks = tokensOf(lit);
    if (!looksLikeClassList(toks.map((t) => t.token))) continue;
    for (const { token, line } of toks) {
      const bare = token.replace(VARIANTS, "").replace(/^-/, "");
      if (bare.includes("-[")) continue; // an arbitrary value; the ratchet owns it
      const name = bare.replace(/\/(?:\[[^\]]*\]|[0-9.]+)$/, ""); // drop the opacity modifier
      const cut = name.indexOf("-");
      if (cut < 0) continue;
      const util = name.slice(0, cut);
      const value = name.slice(cut + 1);
      const notColor = NOT_A_COLOR[util];
      if (!notColor) continue;
      if (notColor.test(value)) continue;
      if (PALETTE.has(value.split("-")[0])) continue;
      if (tokens.has(value)) continue;
      hits.push(`${file}:${line}: ${token} (no --color-${value} in styles.css)`);
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Counting and reporting
// ---------------------------------------------------------------------------

function tally(findings: Finding[]): Baseline {
  const files: Record<string, Record<string, number>> = {};
  const totals: Record<string, number> = {};
  for (const p of PROPERTIES) totals[p] = 0;
  for (const f of findings) {
    (files[f.file] ??= {})[f.property] = (files[f.file]?.[f.property] ?? 0) + 1;
    totals[f.property] += 1;
  }
  const sortedFiles: Record<string, Record<string, number>> = {};
  for (const name of Object.keys(files).sort()) {
    const row: Record<string, number> = {};
    for (const p of PROPERTIES) if (files[name][p]) row[p] = files[name][p];
    sortedFiles[name] = row;
  }
  return { totals, files: sortedFiles };
}

/** What went up, where, and which values are sitting there now. */
function regressions(now: Baseline, base: Baseline, findings: Finding[]): string[] {
  const lines: string[] = [];
  for (const file of Object.keys(now.files).sort()) {
    for (const property of PROPERTIES) {
      const after = now.files[file][property] ?? 0;
      const before = base.files[file]?.[property] ?? 0;
      if (after <= before) continue;
      lines.push(`${file}  ${property}: ${before} -> ${after}`);
      const sites = findings
        .filter((f) => f.file === file && f.property === property)
        .sort((a, b) => a.line - b.line);
      for (const s of sites.slice(0, 40)) lines.push(`    ${file}:${s.line}  ${s.value}`);
      if (sites.length > 40) lines.push(`    ...and ${sites.length - 40} more in this file`);
    }
  }
  if (lines.length) {
    lines.push("");
    lines.push("Use a token from src/styles.css. If you genuinely removed values elsewhere");
    lines.push("in this change, lower the floor with: bun run style:baseline");
  }
  return lines;
}

// ---------------------------------------------------------------------------

describe("style lint", () => {
  const files = sourceFiles(ROOT);
  const sources = files.map((f) => [f, readFileSync(f, "utf8")] as const);
  const findings = sources.flatMap(([f, src]) => scanFile(f, src));
  const now = tally(findings);

  if (WRITE) {
    writeFileSync(BASELINE_PATH, JSON.stringify(now, null, 2) + "\n");
    // eslint-disable-next-line no-console
    console.log(`wrote ${rel(BASELINE_PATH)}:`, now.totals);
  }

  const baseline: Baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));

  it("holds every tracked property at or below its baseline, file by file", () => {
    expect(regressions(now, baseline, findings).join("\n")).toBe("");
  });

  it("resolves every colour class to a --color-* token declared in styles.css", () => {
    const tokens = declaredColorTokens(readFileSync(STYLES, "utf8"));
    const hits = sources.flatMap(([f, src]) => unresolvedColorClasses(f, src, tokens));
    expect(hits.join("\n")).toBe("");
  });

  // Both assertions above pass by finding nothing, which is also what a lint
  // that has quietly stopped working looks like. These feed it known-bad and
  // known-good input so that "zero" keeps meaning zero.
  it("still catches what it is looking for", () => {
    const fake = join(ROOT, "fake.tsx");
    const bad = `<p className="flex items-center text-[13px] rounded-[5px] max-w-[880px] duration-[400ms] ease-[cubic-bezier(.1,.2,.3,.4)] bg-#ff0000" />`;
    const props = scanFile(fake, bad).map((f) => f.property);
    for (const p of PROPERTIES) expect(props).toContain(p);

    const tokens = declaredColorTokens(readFileSync(STYLES, "utf8"));
    expect(
      unresolvedColorClasses(
        fake,
        `<p className="flex items-center bg-panel-2 text-text" />`,
        tokens,
      ).length,
    ).toBe(1);
    // Prose is not a class list, and a real token is not a violation.
    expect(
      unresolvedColorClasses(
        fake,
        `"a text-based clue" "flex items-center bg-panel text-text-dim"`,
        tokens,
      ).length,
    ).toBe(0);
  });
});
