// The mark has exactly one home. Everything that draws it, in React, on a
// canvas, or into a PNG, imports `dinoPaths()`; nothing retypes the outline.
//
// This is a test rather than a note because a note is what was there before.
// scripts/og-arcade.mjs carried a hand-copy of the dinosaur under a comment
// reading "the same dino as src/components/balasaur/DinoMark.tsx", the mark
// was redrawn, the comment stayed true-looking, and twelve share cards shipped
// with the previous animal on them for months. Nobody could see it, because
// the only place the two drawings sat side by side was a JPG.
//
// The checks run over src and scripts and over .ts, .tsx and .mjs alike,
// because the copy that went stale was in a build script, not in the app.

import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DINO_MARK_VIEWBOX, dinoPaths, type DinoMood } from "./DinoMark";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");
const THIS_FILE = fileURLToPath(import.meta.url);
const SOURCE_OF_TRUTH = join(HERE, "DinoMark.tsx");

// The body of the animal the current mark replaced, exactly as it sat in
// scripts/og-arcade.mjs. Kept here so the failure names the thing it found.
const RETIRED_BODY =
  "M4 17c0-3 2-5 5-5h2c2 0 3-1 3-3 0-2 2-3 4-3 1.5 0 3 1 3 3v2c0 4-3 7-7 7H6c-1 0-2-.5-2-1z";

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      out.push(...sourceFiles(p));
      continue;
    }
    if (!/\.(tsx?|mjs|js)$/.test(name)) continue;
    if (name.endsWith(".gen.ts") || name.endsWith(".d.ts")) continue;
    out.push(p);
  }
  return out;
}

// This file quotes the retired outline in order to hunt for it, so it is the
// one file excluded from its own search.
const FILES = [...sourceFiles(join(ROOT, "src")), ...sourceFiles(join(ROOT, "scripts"))].filter(
  (f) => f !== THIS_FILE,
);

function filesContaining(needle: string, allow: string[] = []): string[] {
  return FILES.filter((f) => !allow.includes(f) && readFileSync(f, "utf8").includes(needle)).map(
    (f) => f.slice(ROOT.length + 1),
  );
}

const MOODS: DinoMood[] = ["calm", "chomp", "sleep"];

/** Enough of a path to be unmistakable, short enough that a copy of the
 *  constant it came from still contains it verbatim. */
function fingerprint(d: string): string {
  return d.slice(0, 32);
}

describe("the dinosaur has one source", () => {
  it("scans a real set of files", () => {
    // A walker that silently found nothing would pass every check below.
    expect(FILES.length).toBeGreaterThan(50);
    expect(FILES).toContain(SOURCE_OF_TRUTH);
    expect(FILES).toContain(join(ROOT, "scripts", "og-arcade.mjs"));
  });

  it("carries no copy of the animal the mark replaced", () => {
    expect(filesContaining(RETIRED_BODY).join(", ")).toBe("");
  });

  it("keeps the outline out of every file but DinoMark.tsx", () => {
    const hits = new Set<string>();
    for (const mood of MOODS) {
      for (const filled of [false, true]) {
        for (const p of dinoPaths(mood, filled, 2)) {
          for (const f of filesContaining(fingerprint(p.d), [SOURCE_OF_TRUTH])) hits.add(f);
        }
      }
    }
    // A file here has retyped path data instead of calling dinoPaths().
    expect([...hits].sort().join(", ")).toBe("");
  });

  it("keeps the shifted viewBox out of every file but DinoMark.tsx", () => {
    // The drawing sits low in its box, so a hardcoded "0 0 24 24" crops the
    // feet. Anything drawing the mark reads DINO_MARK_VIEWBOX instead.
    expect(filesContaining(DINO_MARK_VIEWBOX, [SOURCE_OF_TRUTH]).join(", ")).toBe("");
  });
});
