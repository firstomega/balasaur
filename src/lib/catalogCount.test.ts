import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CATALOG_COUNT, CATALOG_FLOOR, CATALOG_FLOOR_LABEL } from "./catalogCount";

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith(".gen.ts"))
      out.push(p);
  }
  return out;
}

// No leading quote required: JSX text sits on its own line with nothing
// before it, which is where /about prints its count.
const pattern = /\b\d{2,3},\d{3}\+?\s+(titles|movies|shows)\b/;

describe("catalog count", () => {
  it("floors to a figure the live catalog cannot fall under", () => {
    expect(CATALOG_FLOOR).toBeLessThanOrEqual(CATALOG_COUNT);
    expect(CATALOG_FLOOR % 1000).toBe(0);
    expect(CATALOG_FLOOR_LABEL).toBe(CATALOG_FLOOR.toLocaleString("en-US"));
  });

  it("is the only title count printed in page copy", () => {
    // Movie Night kept "Reading 74,000 titles" while /about said more than
    // 92,000, against a catalog of 104,121. A hardcoded count goes stale the
    // night the sync adds titles, so every page quotes the shared constant.
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const offenders: string[] = [];
    for (const dir of ["routes", "components"]) {
      for (const file of sourceFiles(join(root, dir))) {
        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((line, i) => {
          const code = line.trim();
          if (code.startsWith("//") || code.startsWith("*") || code.startsWith("/*")) return;
          if (pattern.test(line)) offenders.push(`${file}:${i + 1}: ${code}`);
        });
      }
    }
    expect(offenders.join("\n")).toBe("");
  });

  it("catches a hardcoded count however the line is written", () => {
    expect(pattern.test('  "Reading 74,000 titles",')).toBe(true);
    expect(pattern.test("                More than 92,000 movies and TV shows.")).toBe(true);
    expect(pattern.test("  Reading {CATALOG_FLOOR_LABEL} titles")).toBe(false);
  });
});
