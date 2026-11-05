// Copy lint, run as a test so it rides `bun test src` locally and in CI.
//
// House rules from /CLAUDE.md, enforced mechanically because they kept
// regressing by hand: no em-dash in user-visible text, and none of the
// machine-voice words that read as generated filler. Comments and developer
// logs are not user-visible and are excluded; the lone "—" table placeholder
// is a typographic convention and stays.
//
// VOICE PATTERNS. Below the two original checks sit the Principle 4 voice
// checks that a regex can answer without false alarms: generic copy any
// competitor could print, tap-and-get pitches, questions in display slots,
// copy that presumes who the reader is, internal wording, runs of fragments,
// and universal claims. Each was measured against every string in src before
// it became a hard failure. What already ships is held in
// copyLint.baseline.json, per pattern and per file. A count may fall, never
// rise. When you rewrite a baselined line, run `bun run copy:baseline` in the
// same change so the lower count is the one defended from then on.
//
// Patterns with too many false alarms to fail the build are printed as
// warnings instead. The check reads only literals and JSX text in src. Copy
// stored in the database, and strings assembled across variables, are left to
// review.

import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { collectionComposition, collectionDek } from "./collectionsProse";
import { SITE_DESCRIPTION } from "./seo";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const BASELINE_PATH = join(HERE, "copyLint.baseline.json");
const WRITE = process.env.COPY_BASELINE === "write";
const BANNED_WORDS = ["powered by", "seamlessly", "curated", "leverage"];

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

/** Drop comments (not user-visible) and the standalone "—" placeholder. */
function visibleText(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "")
    .replace(/"—"|'—'|`—`/g, '"-"');
}

describe("copy lint", () => {
  const files = sourceFiles(ROOT);

  it("finds no em-dash in user-visible strings", () => {
    const hits: string[] = [];
    for (const f of files) {
      const lines = visibleText(readFileSync(f, "utf8")).split("\n");
      lines.forEach((line, i) => {
        if (line.includes("—") && !line.includes("console.")) {
          hits.push(`${f.replace(ROOT, "src")}:${i + 1}: ${line.trim().slice(0, 80)}`);
        }
      });
    }
    expect(hits.join("\n")).toBe("");
  });

  it("finds none of the banned machine-voice words in strings", () => {
    const hits: string[] = [];
    for (const f of files) {
      const lines = visibleText(readFileSync(f, "utf8")).split("\n");
      lines.forEach((line, i) => {
        const hasString = /["'`>]/.test(line);
        if (!hasString || line.includes("console.")) return;
        const lower = line.toLowerCase();
        for (const w of BANNED_WORDS) {
          // Only flag the word inside an actual string/JSX-text position.
          const inString = new RegExp(`["'\`>][^"'\`<]*${w}`, "i").test(line);
          if (lower.includes(w) && inString) {
            hits.push(`${f.replace(ROOT, "src")}:${i + 1} (${w}): ${line.trim().slice(0, 80)}`);
          }
        }
      });
    }
    expect(hits.join("\n")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Voice patterns: extracting the text
// ---------------------------------------------------------------------------

/** Trivia fixtures for the arcade and refine screens, not copy. */
const VOICE_EXCLUDED = new Set(["src/routes/dev.arcade.tsx", "src/routes/dev.refine.tsx"]);

/** Keys whose value is shown as a display line: a tile hook, a meta
 *  description, a lede. A question here is a slogan, not a form. */
type Slot = "hook" | "description" | "lede" | "blurb" | "tagline" | "heading";
const SLOT_KEY = /\b(hook|description|lede|blurb|tagline)\s*(?::|=\s*\{?)\s*$/;

/** One piece of visible text: a string literal, a run of JSX text, or the
 *  text of an h1 to h3. `slotOnly` units feed the slot checks and nothing
 *  else, because their words are already counted as JSX text. */
type Unit = { text: string; line: number; slot: Slot | null; slotOnly?: boolean };

const STRING_LITERAL =
  /"([^"\\\n]*(?:\\.[^"\\\n]*)*)"|'([^'\\\n]*(?:\\.[^'\\\n]*)*)'|`([^`\\]*(?:\\.[^`\\]*)*)`/g;

/** Blank out comments without moving anything, so offsets still map to lines. */
function blankComments(src: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, " ");
  return src
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|\s)(\/\/.*)$/gm, (_m, lead: string, c: string) => lead + blank(c));
}

const lineAt = (src: string, index: number) => src.slice(0, index).split("\n").length;
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

const looksLikeCode = (s: string) =>
  /^[\w./@:-]+$/.test(s) ||
  /(^|\s)(flex|grid|text-|bg-|px-|py-|mt-|mb-|w-|h-|rounded|border|items-|justify-|font-|tracking-|gap-|hover:|md:|sm:|lg:)/.test(
    s,
  ) ||
  /[{};]\s*$/.test(s) ||
  /^(select|insert|update|with)\s/i.test(s) ||
  /https?:\/\//.test(s);

/** Lines whose strings are for developers: logs, thrown errors. */
const DEV_LINE = /console\.|\bthrow\b|new (?:Error|RegExp|URL)\b/;

function units(raw: string): Unit[] {
  const src = blankComments(raw);
  const lines = src.split("\n");
  const out: Unit[] = [];

  // String literals, with the key they are assigned to when it is a slot.
  STRING_LITERAL.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = STRING_LITERAL.exec(src))) {
    const line = lineAt(src, m.index);
    const prev = lines[line - 2] ?? "";
    if (DEV_LINE.test(lines[line - 1] ?? "") || (DEV_LINE.test(prev) && /\(\s*$/.test(prev)))
      continue;
    // Interpolations become {x}. A string that ends in one reads as code to
    // looksLikeCode, which is how the patterns were measured.
    const text = squash((m[1] ?? m[2] ?? m[3] ?? "").replace(/\$\{[^}]*\}/g, "{x}"));
    if (!/[A-Za-z]{2,}/.test(text) || looksLikeCode(text)) continue;
    const key = SLOT_KEY.exec(src.slice(Math.max(0, m.index - 40), m.index));
    const slot = (key?.[1] as Slot | undefined) ?? null;
    // An unkeyed literal has to read like a sentence to count as copy.
    if (!slot && !(/\s/.test(text) && /^[A-Z0-9"'{]/.test(text))) continue;
    out.push({ text, line, slot });
  }

  // JSX text: whatever sits between a closing ">" and the next "<", with
  // {expressions} folded to {x}. Anything still carrying code punctuation
  // after the fold is not text.
  for (const j of src.matchAll(/>([^<>]+)</g)) {
    let body = j[1];
    for (let prev = ""; prev !== body; )
      [prev, body] = [body, body.replace(/\{[^{}]*\}/g, "\u0001")];
    if (/[{};=`]|&&|\|\|/.test(body)) continue;
    const text = squash(body.replace(/\u0001/g, "{x}"));
    if (!/[A-Za-z]{2,}/.test(text) || !/\s/.test(text)) continue;
    const lead = j[1].length - j[1].trimStart().length;
    out.push({ text, line: lineAt(src, j.index + 1 + lead), slot: null });
  }

  // Headings. Expressions inside keep only their string literals, so the "?"
  // of a ternary is not read as a question.
  for (const h of src.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/g)) {
    let body = h[2];
    for (let prev = ""; prev !== body; ) {
      prev = body;
      body = body.replace(/\{([^{}]*)\}/g, (_x, inner: string) =>
        [...inner.matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`/g)]
          .map((s) => s[1] ?? s[2] ?? s[3])
          .join(" "),
      );
    }
    const text = squash(body.replace(/<[^>]*>/g, " "));
    if (text) out.push({ text, line: lineAt(src, h.index), slot: "heading", slotOnly: true });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Voice patterns: the checks
// ---------------------------------------------------------------------------

const sentences = (s: string) =>
  s
    .split(/(?<=[.?!])\s+(?=[A-Z0-9{"'])/)
    .map((x) => x.trim())
    .filter(Boolean);
const wordCount = (s: string) => s.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
/** Two or more sentences, every one of them five words or fewer. */
const allShort = (s: string) => {
  const ss = sentences(s);
  return ss.length >= 2 && ss.every((x) => wordCount(x) <= 5) && /[.!?]$/.test(s);
};
const isQuestion = (s: string) => /\?(\s|$)/.test(s);

type Check = { id: string; what: string; test: (u: Unit) => boolean };

/** Hard failures. Each one was run against every string in src and every hit
 *  it produced was a line the rule is meant to catch. */
const HARD: Check[] = [
  {
    id: "H1",
    what: "generic copy any competitor could print",
    test: (u) =>
      /\b(discover, track|all in one place|your personal (entertainment|movie)|next favorite|something for everyone|endless|ultimate)\b/i.test(
        u.text,
      ),
  },
  {
    id: "H2",
    what: "tap-and-get pitch that narrates the interface",
    test: (u) =>
      sentences(u.text).some((s) =>
        /^(Tap|Pick|Click|Choose|Select)\b[^.?!]*,\s*(get|see|find)\b/i.test(s),
      ),
  },
  {
    id: "H3",
    what: "question in a hook, description, lede, blurb, tagline or heading",
    test: (u) => u.slot !== null && isQuestion(u.text),
  },
  {
    id: "H4",
    what: "copy that presumes who the reader is or what they know",
    test: (u) =>
      /\b(for people who|you watch like|you know (these|where|more)|prove (it|you)|have all wrong|did you get)\b/i.test(
        u.text,
      ),
  },
  {
    id: "H5",
    what: "internal wording",
    test: (u) => /\b(snapshot|prototype|pipeline|backfill)\b/i.test(u.text),
  },
  {
    id: "H6",
    what: "run of fragments: three or more sentences, two of them three words or fewer",
    test: (u) => {
      const ss = sentences(u.text);
      return ss.length >= 3 && ss.filter((s) => wordCount(s) <= 3).length >= 2;
    },
  },
  {
    id: "H6b",
    what: "hook made only of sentences of five words or fewer",
    test: (u) => u.slot === "hook" && allShort(u.text),
  },
  {
    id: "H7",
    what: "universal claim about what everyone knows or thinks",
    test: (u) =>
      /\b(everyone|everybody|nobody|no one)\s+(is (sure|wrong|right)|knows|agrees|says|is looking)\b/i.test(
        u.text,
      ) && !H7_ALLOWED.has(u.text),
  },
];

/** A Movie Night picker option the reader answers with a control on screen. */
const H7_ALLOWED = new Set(["Something everyone knows, or a deep cut?"]);

/** Printed, never failing: each of these flags more good lines than bad. */
const WARN: Check[] = [
  {
    id: "W1",
    what: "every sentence five words or fewer (outside hooks)",
    test: (u) => u.slot !== "hook" && allShort(u.text),
  },
  {
    id: "W2",
    what: "question answered by a short line",
    test: (u) => /\?\s+[A-Z][^.?!]{0,40}[.!]/.test(u.text),
  },
  {
    id: "W3",
    what: "interface narration (lands here, shows up here)",
    test: (u) => /\b(lands|collect|show up|shows up|appear|appears) here\b/i.test(u.text),
  },
  {
    id: "W4",
    what: "figurative verb (says, tells you, does the X-ing, put it there)",
    test: (u) => /\b(says|speaks|does the \w+ing|put it there|tells you)\b/i.test(u.text),
  },
  {
    id: "W5",
    what: "wordplay",
    test: (u) =>
      /\b(versus|vs\.?)\b|\b(the posters that wear|ways into|in the same vein|hits different|no-brainer|guilty pleasure|must-watch|binge-worthy|hidden gem)\b/i.test(
        u.text,
      ),
  },
];

type Hit = { id: string; file: string; line: number; text: string };

/** Hits for one file, counted once per pattern and line so a heading and the
 *  JSX text inside it are not counted twice. */
function scan(file: string, src: string, checks: Check[]): Hit[] {
  const seen = new Set<string>();
  const hits: Hit[] = [];
  for (const u of units(src)) {
    for (const c of checks) {
      if (u.slotOnly && c.id !== "H3") continue;
      if (!c.test(u)) continue;
      const k = `${c.id}:${u.line}`;
      if (seen.has(k)) continue;
      seen.add(k);
      hits.push({ id: c.id, file, line: u.line, text: u.text });
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** The Colour Shelf prototype's worst lines, plus the old default description,
 *  each in the position it was written in. Every pattern must catch every one
 *  of its lines, so loosening a pattern later fails here first. */
const MUST_CATCH: Record<string, string[]> = {
  H1: [
    `content: "Your personal entertainment database. Discover, track, and rate movies and TV all in one place.",`,
  ],
  H2: [
    `<h2>Pick a colour, get the posters that wear it</h2>`,
    `<h2>Tap a colour, get a ranked list</h2>`,
  ],
  H3: [
    `<h1 className="hero">Is it worth two hours? <em>One number says.</em></h1>`,
    `<h2>Did you get them?</h2>`,
    `hook: "Six clues. How few do you need?",`,
    `description:\n  "Titanic II is real. Which of these are not?",`,
  ],
  H4: [
    `<h1>You watch like the {archetype}.</h1>`,
    `<h1>Quick games for people who watch a lot.</h1>`,
    `<h2>Did you get them?</h2>`,
    `hook: "You have said these lines out loud. Prove you know where from.",`,
  ],
  H5: [
    `<h2>Highest scored {genre} in this snapshot</h2>`,
    `toast("The games open here in the full site. This prototype only shows the menu.");`,
  ],
  H6: [
    `hook: "Ten questions. Same ten for everyone. One board.",`,
    `hook: "Sixty seconds. Two bins. Your thumb versus the catalog.",`,
  ],
  H6b: [
    `hook: "Three were in it. One never was. Five seconds.",`,
    `hook: "A whole movie in emoji. Name it.",`,
  ],
  H7: [
    `<h2>What everyone is looking up</h2>`,
    `hook: "Was Shrek before Monsters, Inc.? Everyone is sure. Everyone is wrong.",`,
  ],
};

/** House sentences the owner already accepts. None of them may trip any hard
 *  pattern in any slot, including a meta description, the strictest one that
 *  takes prose. The leaders sentence is the one CLAUDE.md names as the voice
 *  to copy, rendered here by the real generator. */
const MUST_PASS: string[] = [
  collectionDek(
    {
      slug: "action-on-netflix",
      kind: "service",
      title: "Action Movies on Netflix, Ranked",
      item_count: 60,
      top_score: 87,
      median_score: 76,
      newest_title: "Facing El Chapo",
      newest_date: "2026-08-14",
    },
    [
      { title: "Spider-Man: Into the Spider-Verse", score: 87 },
      { title: "Aliens", score: 85 },
      { title: "Top Gun: Maverick", score: 84 },
    ],
  ),
  collectionComposition(
    [
      [94, "2014", ["Netflix"]],
      [90, "2015", ["Netflix"]],
      [88, "2016", ["Netflix"]],
      [85, "2017", ["Max"]],
      [82, "2018", []],
      [79, "2019", []],
      [75, "1999", []],
      [71, "1998", []],
    ].map(([score, year, streaming]) => ({
      score: score as number,
      year: year as string,
      streaming: streaming as string[],
    })),
  ),
  "Spider-Man: Into the Spider-Verse leads at 87, ahead of Aliens (85) and Top Gun: Maverick (84).",
  "60 streaming titles made the cut, ordered from highest Balasaur Score to lowest.",
  "6 of the 8 are from the 2010s.",
  "3 of the 8 stream on Netflix.",
  "Tom Hanks's 1990s titles rate highest: a median Balasaur Score of 76 across 13, against 73 for the 2010s.",
  "Crime, mystery and thriller cover 88% of what you Loved.",
  "It runs long at 2h 48m.",
  SITE_DESCRIPTION,
];

// ---------------------------------------------------------------------------
// Baseline
// ---------------------------------------------------------------------------

type Baseline = {
  totals: Record<string, number>;
  patterns: Record<string, Record<string, number>>;
};

function tally(hits: Hit[]): Baseline {
  const totals: Record<string, number> = {};
  const patterns: Record<string, Record<string, number>> = {};
  for (const c of HARD) totals[c.id] = 0;
  for (const h of hits) {
    totals[h.id] += 1;
    const row = (patterns[h.id] ??= {});
    row[h.file] = (row[h.file] ?? 0) + 1;
  }
  const sorted: Record<string, Record<string, number>> = {};
  for (const c of HARD) {
    if (!patterns[c.id]) continue;
    const row: Record<string, number> = {};
    for (const f of Object.keys(patterns[c.id]).sort()) row[f] = patterns[c.id][f];
    sorted[c.id] = row;
  }
  return { totals, patterns: sorted };
}

function regressions(now: Baseline, base: Baseline, hits: Hit[]): string[] {
  const lines: string[] = [];
  for (const c of HARD) {
    for (const file of Object.keys(now.patterns[c.id] ?? {})) {
      const after = now.patterns[c.id][file];
      const before = base.patterns[c.id]?.[file] ?? 0;
      if (after <= before) continue;
      lines.push(`${c.id} (${c.what})  ${file}: ${before} -> ${after}`);
      for (const h of hits.filter((x) => x.id === c.id && x.file === file))
        lines.push(`    ${file}:${h.line}  ${h.text.slice(0, 100)}`);
    }
  }
  if (lines.length) {
    lines.push("");
    lines.push("Rewrite the line as a fact about a title, person, list or number (CLAUDE.md,");
    lines.push("Principle 4). If you removed hits elsewhere in this change, lower the floor");
    lines.push("with: bun run copy:baseline");
  }
  return lines;
}

// ---------------------------------------------------------------------------

describe("copy lint: voice", () => {
  const files = sourceFiles(ROOT).filter((f) => !VOICE_EXCLUDED.has(rel(f)));
  const sources = files.map((f) => [rel(f), readFileSync(f, "utf8")] as const);
  const hits = sources.flatMap(([f, src]) => scan(f, src, HARD));
  const now = tally(hits);

  if (WRITE) {
    writeFileSync(BASELINE_PATH, JSON.stringify(now, null, 2) + "\n");
    // eslint-disable-next-line no-console
    console.log(`wrote src/lib/copyLint.baseline.json:`, now.totals);
  }

  const baseline: Baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));

  it("holds every voice pattern at or below its baseline, file by file", () => {
    expect(regressions(now, baseline, hits).join("\n")).toBe("");
  });

  it("prints the warn-only patterns without failing", () => {
    const warns = sources.flatMap(([f, src]) => scan(f, src, WARN));
    const out: string[] = [];
    for (const c of WARN) {
      const mine = warns.filter((w) => w.id === c.id);
      if (!mine.length) continue;
      out.push(`copy lint warning ${c.id}, ${c.what}: ${mine.length}`);
      for (const w of mine) out.push(`    ${w.file}:${w.line}  ${w.text.slice(0, 90)}`);
    }
    // eslint-disable-next-line no-console
    if (out.length) console.log(out.join("\n"));
    expect(true).toBe(true);
  });

  // The ratchet passes by finding nothing new, which is also what a lint that
  // has quietly stopped working looks like. These feed it known-bad and
  // known-good input so that "zero" keeps meaning zero.
  it("catches every fixture line with the pattern written for it", () => {
    const missed: string[] = [];
    for (const [id, snippets] of Object.entries(MUST_CATCH)) {
      for (const s of snippets) {
        const found = scan("fixture.tsx", s, HARD).some((h) => h.id === id);
        if (!found) missed.push(`${id} missed: ${s}`);
      }
    }
    expect(missed.join("\n")).toBe("");
    for (const c of HARD) expect(Object.keys(MUST_CATCH)).toContain(c.id);
  });

  it("passes the house sentences in every slot", () => {
    const flagged: string[] = [];
    for (const s of MUST_PASS) {
      expect(s.length).toBeGreaterThan(0);
      const asJson = JSON.stringify(s);
      for (const snippet of [`description: ${asJson},`, `<p>${s}</p>`, `<h2>${s}</h2>`]) {
        for (const h of scan("fixture.tsx", snippet, HARD)) flagged.push(`${h.id}: ${snippet}`);
      }
    }
    expect(flagged.join("\n")).toBe("");
  });
});
