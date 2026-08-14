import { createFileRoute } from "@tanstack/react-router";
import { SITE_ORIGIN } from "@/lib/seo";
import { listSitemapEntries } from "@/lib/media.server";
import { urlsetXml, xmlResponse, type SitemapUrl } from "@/lib/sitemapXml";

// Served at /sitemap-titles.xml — individual movie and TV pages, capped at the
// budget in listSitemapEntries and ordered by how many people have rated the
// title. Deliberately a fraction of the catalog: see the note there.
export const Route = createFileRoute("/sitemap-titles.xml")({
  server: {
    handlers: {
      GET: async () => {
        const urls: SitemapUrl[] = [];
        try {
          const entries = await listSitemapEntries();
          for (const e of entries) {
            urls.push({ loc: `${SITE_ORIGIN}${e.path}`, lastmod: e.lastmod });
          }
        } catch (err) {
          // An empty urlset is valid XML — better than a 500 that makes Search
          // Console mark the sitemap as unreadable.
          console.error("[sitemap] entry load failed:", err);
        }
        return xmlResponse(urlsetXml(urls));
      },
    },
  },
});
