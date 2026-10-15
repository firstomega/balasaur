import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

// The indexed share used to be measured on a sample that slid through the
// catalog every day, so it moved whenever the sample moved and read as Google
// changing its mind. The fix is a fixed panel inspected on every run. These
// tests guard the properties that make the panel's number comparable from one
// run to the next, which nothing else would notice breaking: the SQL runs
// fine with 90 rows, with a duplicate, or with the panel sorted last.
const MIGRATION = readFileSync(
  new URL("../../supabase/migrations/20261015120000_index_panel.sql", import.meta.url),
  "utf8",
);
const GSC_SYNC = readFileSync(
  new URL("../../supabase/functions/gsc-sync/index.ts", import.meta.url),
  "utf8",
);

type Row = { url: string; family: string };

function panelRows(): Row[] {
  const rows: Row[] = [];
  const re = /^\s+\('(https?:\/\/[^']+)', '([a-z]+)', '\d{4}-\d{2}-\d{2}', '[^']*'\),?$/gm;
  for (const m of MIGRATION.matchAll(re)) rows.push({ url: m[1], family: m[2] });
  return rows;
}

/**
 * The family gsc-sync stores for a URL, read from gsc-sync itself, so a change
 * to its rules fails here instead of silently splitting the panel's families
 * from the ones index_status records.
 */
function familyOf(url: string): string {
  const block = GSC_SYNC.slice(GSC_SYNC.indexOf("family: url.includes("));
  const end = block.indexOf(",\n");
  const chain = block.slice(0, end);
  const rules = [...chain.matchAll(/url\.includes\("([^"]+)"\)\s*\?\s*"([a-z]+)"/g)].map(
    (m) => [m[1], m[2]] as const,
  );
  const fallback = chain.match(/:\s*"([a-z]+)"\s*$/)?.[1];
  expect(rules.length).toBe(4);
  expect(fallback).toBe("page");
  for (const [needle, family] of rules) if (url.includes(needle)) return family;
  return fallback as string;
}

function sampleFn(): string {
  const start = MIGRATION.indexOf("create or replace function public.index_status_sample()");
  expect(start).toBeGreaterThan(-1);
  return MIGRATION.slice(start, MIGRATION.indexOf("$$;", start));
}

describe("fixed index panel", () => {
  it("seeds exactly 100 distinct URLs", () => {
    const rows = panelRows();
    expect(rows.length).toBe(100);
    expect(new Set(rows.map((r) => r.url)).size).toBe(100);
  });

  it("only holds this site's URLs, which is all gsc-sync will inspect", () => {
    for (const { url } of panelRows()) expect(url.startsWith("https://balasaur.com/")).toBe(true);
  });

  it("labels each URL with the same family gsc-sync stores", () => {
    for (const { url, family } of panelRows()) expect(family).toBe(familyOf(url));
  });

  it("keeps the mix of titles, people, lists and site pages", () => {
    const count = (f: (r: Row) => boolean) => panelRows().filter(f).length;
    const titles = count((r) => r.family === "movie" || r.family === "tv");
    expect(titles >= 35 && titles <= 45).toBe(true);
    expect(count((r) => r.family === "person")).toBe(20);
    expect(count((r) => r.family === "collection")).toBe(25);
    expect(panelRows().some((r) => r.url === "https://balasaur.com/")).toBe(true);
  });

  it("uses canonical title URLs, so Google reports the page and not a redirect", () => {
    // The form mediaSlug() emits: lowercase slug words, then the numeric id.
    for (const { url, family } of panelRows()) {
      if (family !== "movie" && family !== "tv") continue;
      expect(/^https:\/\/balasaur\.com\/(movie|tv)\/[a-z0-9]+(-[a-z0-9]+)*-\d+$/.test(url)).toBe(
        true,
      );
    }
  });
});

describe("index_status_sample", () => {
  it("puts the panel ahead of the rotating sample", () => {
    const fn = sampleFn();
    expect(/from index_panel/.test(fn)).toBe(true);
    expect(/0 as grp/.test(fn)).toBe(true);
    expect(/1 as grp/.test(fn)).toBe(true);
    expect(/array_agg\(u order by grp, ord\)/.test(fn)).toBe(true);
  });

  it("sends each URL once, so a panel URL is never inspected twice in a run", () => {
    expect(/distinct on \(u\)/.test(sampleFn())).toBe(true);
  });

  it("fits panel plus rotating windows inside the gsc-sync daily budget", () => {
    const budget = Number(GSC_SYNC.match(/const INSPECT_DAILY_BUDGET = (\d+);/)?.[1]);
    expect(budget).toBeGreaterThan(0);
    // Every rotating window is written as "... % cnt) < N".
    const windows = [...sampleFn().matchAll(/\) < (\d+)\s*$/gm)].map((m) => Number(m[1]));
    expect(windows.length).toBe(3);
    const worstCase = panelRows().length + windows.reduce((a, b) => a + b, 0);
    expect(worstCase <= budget / 2).toBe(true);
  });
});

describe("reporting views", () => {
  for (const view of ["index_panel_latest", "gsc_top20_weekly"]) {
    it(`${view} runs as the caller and is closed to the browser key`, () => {
      const declared = new RegExp(
        `create or replace view public\\.${view}\\s+with \\(security_invoker = true\\)`,
      );
      expect(declared.test(MIGRATION)).toBe(true);
      expect(MIGRATION).toContain(`revoke all on table public.${view} from anon, authenticated;`);
    });
  }

  it("calls a panel URL indexed on the verdict gsc-sync stores for indexed pages", () => {
    // gsc-sync stores Google's verdict as-is; PASS is "URL is on Google".
    expect(GSC_SYNC).toContain("verdict: s.verdict ?? null");
    expect(MIGRATION).toContain("(l.verdict = 'PASS') as indexed");
  });

  it("counts only real positions in the top-20 and top-10 cuts", () => {
    // gsc_performance defaults position to 0; counting 0 as "<= 10" would
    // report missing data as a first-place ranking.
    expect(MIGRATION).toContain("position > 0 and position <= 20");
    expect(MIGRATION).toContain("position > 0 and position <= 10");
  });
});
