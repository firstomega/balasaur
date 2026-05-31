import { createFileRoute } from "@tanstack/react-router";
import { backfillFromRaw } from "@/lib/media.server";

/**
 * One-shot backfill that rewrites `genres`, `origins`, `streaming` + award columns
 * from already-stored raw_tmdb / raw_omdb. NO external API calls. Same apikey gate
 * as sync-media.
 */
export const Route = createFileRoute("/api/public/hooks/backfill-media")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        const expected =
          process.env.SUPABASE_PUBLISHABLE_KEY ??
          process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        if (!expected || apikey !== expected) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const result = await backfillFromRaw();
          return new Response(JSON.stringify({ ok: true, ...result }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          console.error("[backfill-media] failed:", err);
          return new Response(
            JSON.stringify({
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});