import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

// The sitemap's ORDER BY has now been changed three times and reverted twice,
// each time silently: the XML stays valid either way, so nothing failed. The
// cost of getting it wrong was measured against production on 2026-08-27 —
// 896 of the 2,500 submitted URLs went to titles with under 50 ratings while
// 4,749 titles with 1,000+ ratings, Guardians of the Galaxy and John Wick
// among them, were not submitted at all.
//
// This test does not check the XML. It checks the one decision, so the next
// revert has to be deliberate.
const SOURCE = readFileSync(new URL("./media.server.ts", import.meta.url), "utf8");

function sitemapFn(): string {
  const start = SOURCE.indexOf("export async function listSitemapEntries");
  expect(start).toBeGreaterThan(-1);
  // Up to the next top-level export, which is the end of this function.
  const rest = SOURCE.slice(start + 1);
  const end = rest.indexOf("\nexport ");
  return end === -1 ? rest : rest.slice(0, end);
}

describe("sitemap title ordering", () => {
  it("ranks by rating count, the proxy for search demand", () => {
    const fn = sitemapFn();
    const firstOrder = fn.match(/\.order\(\s*"([a-z_]+)"/);
    expect(firstOrder?.[1]).toBe("vote_count");
  });

  it("does not rank by TMDB weekly popularity", () => {
    // Popularity measures what is trending on TMDB this week, which is
    // uncorrelated with what people search for.
    expect(sitemapFn()).not.toContain('.order("popularity"');
  });

  it("keeps a stable tiebreak so paging cannot drop or repeat a row", () => {
    // Without a unique final sort key, two rows with equal vote_count can
    // swap between the paged requests and a URL is lost or duplicated.
    expect(sitemapFn()).toContain('.order("media_id"');
  });

  it("puts rows with no rating data last rather than first", () => {
    const fn = sitemapFn();
    const voteOrder = fn.slice(fn.indexOf('.order("vote_count"'));
    expect(voteOrder.slice(0, 120)).toContain("nullsFirst: false");
  });
});
