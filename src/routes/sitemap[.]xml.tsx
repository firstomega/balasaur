import { createFileRoute } from "@tanstack/react-router";
import { SITE_ORIGIN } from "@/lib/seo";
import { sitemapIndexXml, xmlResponse } from "@/lib/sitemapXml";

// Served at /sitemap.xml — an index pointing at the two real sitemaps. This
// URL is the one already submitted to Search Console, so it stays the entry
// point; the split below is what makes coverage reportable per page family.
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: () =>
        xmlResponse(
          sitemapIndexXml([
            `${SITE_ORIGIN}/sitemap-pages.xml`,
            `${SITE_ORIGIN}/sitemap-titles.xml`,
          ]),
        ),
    },
  },
});
