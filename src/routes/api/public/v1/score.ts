import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { SITE_ORIGIN } from "@/lib/seo";
import { mediaSlug } from "@/lib/slug";

/**
 * Public API-lite: GET /api/public/v1/score?id=<movie|tv>-<tmdbId>
 *
 * Read-only, attribution-required access to the Balasaur Score for one title —
 * the seed of the "developers embed our data, links accrue to us" loop. Kept
 * deliberately tiny: one row, six public fields, aggressive CDN caching
 * (s-maxage=86400) so even heavy third-party use costs one DB read per title
 * per day. No key/auth: everything returned is already publicly visible on the
 * site, and the cache header is the abuse valve.
 */
export const Route = createFileRoute("/api/public/v1/score")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const json = (body: unknown, status = 200, cacheable = status === 200) =>
          new Response(JSON.stringify(body), {
            status,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Access-Control-Allow-Origin": "*",
              "Cache-Control": cacheable
                ? "public, max-age=3600, s-maxage=86400"
                : "public, max-age=60",
            },
          });

        const id = new URL(request.url).searchParams.get("id") ?? "";
        if (!/^(movie|tv)-\d{1,10}$/.test(id)) {
          return json({ error: "Pass ?id=<movie|tv>-<tmdbId>, e.g. ?id=movie-27205" }, 400, false);
        }

        const { data, error } = await supabaseAdmin
          .from("media")
          .select("media_id, media_type, title, year, rating_balasaur, quality_score, sensitive")
          .eq("media_id", id)
          .maybeSingle();
        if (error) return json({ error: "Lookup failed" }, 500, false);
        // Content-flagged titles are excluded here just like the browse surface.
        if (!data || data.sensitive) return json({ error: "Not found" }, 404);

        const rawId = data.media_id.replace(/^(movie|tv)-/, "");
        const seg = data.media_type === "tv" ? "tv" : "movie";
        return json({
          id: data.media_id,
          type: data.media_type,
          title: data.title,
          year: data.year,
          balasaurScore: data.rating_balasaur,
          weightedScore: data.quality_score,
          url: `${SITE_ORIGIN}/${seg}/${mediaSlug(rawId, data.title)}`,
          attribution: "Score by Balasaur (balasaur.com). Link required when displayed.",
        });
      },
    },
  },
});
