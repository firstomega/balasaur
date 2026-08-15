import { createFileRoute } from "@tanstack/react-router";
import { SITE_ORIGIN } from "@/lib/seo";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { urlsetXml, xmlResponse, type SitemapUrl } from "@/lib/sitemapXml";

/** A person earns a sitemap slot with this many leading or directing credits
 *  in indexable titles. Stricter than the search gate (3): a submitted page
 *  should carry a filmography a stranger would recognize, not three rows. */
const SITEMAP_MIN_TITLES = 8;

// Served at /sitemap-people.xml — people pages worth an index slot, from the
// nightly person_index view. About 1,860 people at the current gate.
export const Route = createFileRoute("/sitemap-people.xml")({
  server: {
    handlers: {
      GET: async () => {
        const urls: SitemapUrl[] = [];
        try {
          // Paged: PostgREST clamps any single request to ~1,000 rows, which
          // once silently truncated the title sitemap. Cap 5,000 for safety.
          const PAGE = 1000;
          for (let offset = 0; offset < 5000; offset += PAGE) {
            const { data, error } = await supabaseAdmin
              .from("person_index")
              .select("person_id")
              .gte("titles", SITEMAP_MIN_TITLES)
              .order("titles", { ascending: false })
              .order("person_id", { ascending: true })
              .range(offset, offset + PAGE - 1);
            if (error) throw error;
            for (const r of data ?? []) {
              urls.push({ loc: `${SITE_ORIGIN}/person/${r.person_id}` });
            }
            if (!data || data.length < PAGE) break;
          }
        } catch (err) {
          // An empty urlset is valid XML; better than an unreadable sitemap.
          console.error("[sitemap] person query failed:", err);
        }
        return xmlResponse(urlsetXml(urls));
      },
    },
  },
});
