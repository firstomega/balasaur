// Shared XML builders for the sitemap family.
//
// The site ships three: /sitemap.xml is an index pointing at the other two,
// /sitemap-pages.xml carries the static pages and ranked collections, and
// /sitemap-titles.xml carries individual titles. Splitting them is a
// diagnostic: Search Console reports coverage per submitted sitemap, so a
// split says whether collections index at a different rate than titles.
// One blended number cannot answer that, and that answer decides where the
// next batch of work goes.

export interface SitemapUrl {
  loc: string;
  lastmod?: string;
}

export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function urlsetXml(urls: SitemapUrl[]): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url><loc>${xmlEscape(u.loc)}</loc>` +
          (u.lastmod ? `<lastmod>${xmlEscape(u.lastmod)}</lastmod>` : "") +
          `</url>`,
      )
      .join("\n") +
    `\n</urlset>\n`
  );
}

export function sitemapIndexXml(locs: string[]): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    locs.map((l) => `  <sitemap><loc>${xmlEscape(l)}</loc></sitemap>`).join("\n") +
    `\n</sitemapindex>\n`
  );
}

export function xmlResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=21600",
    },
  });
}
