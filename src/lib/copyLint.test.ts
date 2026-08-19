// Copy lint, run as a test so it rides `bun test src` locally and in CI.
//
// House rules from /CLAUDE.md, enforced mechanically because they kept
// regressing by hand: no em-dash in user-visible text, and none of the
// machine-voice words that read as generated filler. Comments and developer
// logs are not user-visible and are excluded; the lone "—" table placeholder
// is a typographic convention and stays.

import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
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
