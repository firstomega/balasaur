import { createFileRoute } from "@tanstack/react-router";
import { SITE_ORIGIN } from "@/lib/seo";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { urlsetXml, xmlResponse, type SitemapUrl } from "@/lib/sitemapXml";

// Served at /sitemap-pages.xml — static pages plus every ranked collection.
// These are the pages that answer questions the incumbents answer badly
// ("best sci-fi on Netflix"), so they are the ones worth watching in Search
// Console. Kept apart from titles so their coverage is reported separately.
export const Route = createFileRoute("/sitemap-pages.xml")({
  server: {
    handlers: {
      GET: async () => {
        const staticPaths = [
          "/",
          "/collections",
          // /watched and /lists are personal tools: signed out they render an
          // empty shell, which is exactly the thin page a crawler should never
          // be handed. They carry noindex and stay out of the sitemap.
          "/privacy",
          "/terms",
          "/methodology",
          "/about",
          "/contact",
        ];
        const urls: SitemapUrl[] = staticPaths.map((p) => ({ loc: `${SITE_ORIGIN}${p}` }));

        try {
          // Every materialized collection shelf (~350 rows, one query).
          const { data: shelves, error } = await supabaseAdmin
            .from("collections")
            .select("slug, updated_at")
            .order("slug", { ascending: true });
          if (error) throw error;
          for (const s of (shelves ?? []) as { slug: string; updated_at: string | null }[]) {
            urls.push({
              loc: `${SITE_ORIGIN}/best/${s.slug}`,
              lastmod: s.updated_at ? s.updated_at.slice(0, 10) : undefined,
            });
          }
        } catch (err) {
          // A DB hiccup shouldn't 500 the sitemap — ship the static section.
          console.error("[sitemap] collections load failed:", err);
        }

        return xmlResponse(urlsetXml(urls));
      },
    },
  },
});
