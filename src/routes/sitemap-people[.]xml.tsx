import { createFileRoute } from "@tanstack/react-router";
import { loose } from "@/lib/supabaseLoose";
import { SITE_ORIGIN } from "@/lib/seo";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { urlsetXml, xmlResponse, type SitemapUrl } from "@/lib/sitemapXml";

// Served at /sitemap-people.xml: exactly the kept set, person_index_kept, the
// same rows the person page reads to decide noindex. 850 people (see
// src/lib/indexKeep.ts), down from 10,970.
//
// Ordered by person id, which carries no meaning. It used to be ordered by
// credit count, which put the voice actors with 140 anime credits first;
// Google does not need to be told an order, and an order that ranks the
// wrong people first is worse than none.
export const Route = createFileRoute("/sitemap-people.xml")({
  server: {
    handlers: {
      GET: async () => {
        const urls: SitemapUrl[] = [];
        try {
          // Paged: PostgREST clamps any single request to ~1,000 rows, which
          // once silently truncated the title sitemap.
          const PAGE = 1000;
          for (let offset = 0; offset < 50000; offset += PAGE) {
            const { data, error } = await loose(supabaseAdmin)
              .from("person_index_kept")
              .select("person_id")
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
