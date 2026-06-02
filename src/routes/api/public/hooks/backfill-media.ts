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
        // Gate with the server-only service role key. The publishable/anon
        // key is shipped to every browser and cannot be used as a secret.
        const expected = process.env.SYNC_HOOK_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!expected || apikey !== expected) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          // Optional `{ after: <media_id> }` resumes a previous pass via keyset cursor.
          // The workflow loops this endpoint, threading back the prior `lastId`.
          let after: string | null = null;
          try {
            const body = (await request.json()) as { after?: unknown };
            if (typeof body?.after === "string" && body.after) after = body.after;
          } catch {
            // empty / non-JSON body → start from the beginning
          }
          const result = await backfillFromRaw({ after });
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
