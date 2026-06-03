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
        // Gate with a server-only shared secret (SYNC_HOOK_SECRET), falling back to
        // the service-role key for the platform's own pg_cron. The publishable/anon
        // key is shipped to every browser and can't be used as a secret.
        const expected = process.env.SYNC_HOOK_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!expected || apikey !== expected) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        let force = false;
        let limit: number | undefined;
        let timeBudgetMs: number | undefined;
        let providerBucket: number | undefined;
        let refreshExisting = false;
        try {
          const body = (await request.json()) as {
            force?: boolean;
            limit?: number;
            timeBudgetMs?: number;
            bucket?: number;
            refreshExisting?: boolean;
          } | null;
          force = !!body?.force;
          if (typeof body?.limit === "number") limit = body.limit;
          if (typeof body?.timeBudgetMs === "number") timeBudgetMs = body.timeBudgetMs;
          if (typeof body?.bucket === "number") providerBucket = body.bucket;
          refreshExisting = !!body?.refreshExisting;
        } catch {
          // empty body is fine
        }

        try {
          const result = await syncCatalog({
            force,
            limit,
            timeBudgetMs,
            providerBucket,
            refreshExisting,
          });
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
