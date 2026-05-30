import { createFileRoute } from "@tanstack/react-router";
import { SITE_ORIGIN } from "@/lib/seo";
import { listSitemapEntries } from "@/lib/media.server";

// Served at /sitemap.xml — static pages plus every catalogued title.
// Sitemaps cap at 50,000 URLs; listSitemapEntries already limits well under that.
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const staticPaths = ["/", "/triage", "/lists", "/privacy", "/terms"];
        const urls: { loc: string; lastmod?: string }[] = staticPaths.map((p) => ({
          loc: `${SITE_ORIGIN}${p}`,
        }));

        try {
          const entries = await listSitemapEntries();
          for (const e of entries) {
            urls.push({ loc: `${SITE_ORIGIN}${e.path}`, lastmod: e.lastmod });
          }
        } catch (err) {
          // A DB hiccup shouldn't 500 the sitemap — ship the static section.
          console.error("[sitemap] entry load failed:", err);
        }

        const body =
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
          `\n</urlset>\n`;

        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=21600",
          },
        });
      },
    },
  },
});
