import { createFileRoute } from "@tanstack/react-router";
import { syncCatalog } from "@/lib/media.server";

/**
 * Public hook that triggers a catalog refresh. Auth is the standard
 * Supabase `apikey` header (anon key) used by pg_cron; under /api/public/*
 * so it bypasses Lovable's published-site auth. The handler itself does
 * the real work — the apikey gate keeps the sync from being kicked off
 * by anonymous internet traffic.
 */
export const Route = createFileRoute("/api/public/hooks/sync-media")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        // Gate with the server-only service role key. The publishable/anon
        // key is shipped to every browser and cannot be used as a secret.
        const expected = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!expected || apikey !== expected) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        let force = false;
        try {
          const body = (await request.json()) as { force?: boolean } | null;
          force = !!body?.force;
        } catch {
          // empty body is fine
        }

        try {
          const result = await syncCatalog({ force });
          return new Response(JSON.stringify({ ok: true, ...result }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          console.error("[sync-media] failed:", err);
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