import { createFileRoute } from "@tanstack/react-router";
import { loose } from "@/lib/supabaseLoose";
import { SITE_ORIGIN } from "@/lib/seo";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { urlsetXml, xmlResponse, type SitemapUrl } from "@/lib/sitemapXml";
import { listOriginCollections } from "@/lib/originCollections";
import { ENABLED_SLUGS, GAMES } from "@/lib/arcade/games";

// Served at /sitemap-pages.xml: static pages plus the kept collections, the
// lists that do not repeat a broader one (collection_index_kept, see
// src/lib/indexKeep.ts), and the country shelves. The list page reads the
// same set to decide noindex. Kept apart from titles so their coverage is
// reported separately.
//
// No lastmod on lists. Every list is deleted and rebuilt each night, so its
// updated_at is always last night whether or not a single rank moved.
export const Route = createFileRoute("/sitemap-pages.xml")({
  server: {
    handlers: {
      GET: async () => {
        const staticPaths = [
          "/",
          "/collections",
          "/calendar",
          "/play",
          // Every enabled arcade game, straight from the registry, so the hub
          // grid and the sitemap can never disagree. /play/leaderboard is
          // noindexed and stays out.
          ...ENABLED_SLUGS.map((slug) => GAMES[slug].path),
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
          // Paged, like the people and title sitemaps: PostgREST clamps any
          // single request to ~1,000 rows.
          const PAGE = 1000;
          for (let offset = 0; offset < 10000; offset += PAGE) {
            const { data: shelves, error } = await loose(supabaseAdmin)
              .from("collection_index_kept")
              .select("slug")
              .eq("kept", true)
              .order("slug", { ascending: true })
              .range(offset, offset + PAGE - 1);
            if (error) throw error;
            for (const s of (shelves ?? []) as { slug: string }[]) {
              urls.push({ loc: `${SITE_ORIGIN}/best/${s.slug}` });
            }
            if (!shelves || shelves.length < PAGE) break;
          }

          // Country shelves are request-time, not materialized (see
          // originCollections.ts), so the loop above never sees them. Only
          // gate-passing shelves come back, and every one is kept; anything
          // already listed is skipped as a duplicate.
          const submitted = new Set(urls.map((u) => u.loc));
          for (const o of await listOriginCollections()) {
            const loc = `${SITE_ORIGIN}/best/${o.slug}`;
            if (!submitted.has(loc)) urls.push({ loc });
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
