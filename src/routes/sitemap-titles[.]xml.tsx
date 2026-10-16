import { createFileRoute } from "@tanstack/react-router";
import { SITE_ORIGIN } from "@/lib/seo";
import { listSitemapEntries } from "@/lib/media.server";
import { urlsetXml, xmlResponse, type SitemapUrl } from "@/lib/sitemapXml";

// Served at /sitemap-titles.xml: every kept movie and TV page (see
// src/lib/indexKeep.ts), about 3,700 of the 82,000 that can stand alone.
export const Route = createFileRoute("/sitemap-titles.xml")({
  server: {
    handlers: {
      GET: async () => {
        const urls: SitemapUrl[] = [];
        try {
          const entries = await listSitemapEntries();
          for (const e of entries) {
            urls.push({ loc: `${SITE_ORIGIN}${e.path}` });
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
