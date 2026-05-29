import { createServerFn } from "@tanstack/react-start";
import { loadCatalogFromDb, syncCatalog } from "./media.server";

export const getTrendingMedia = createServerFn({ method: "GET" }).handler(async () => {
  return loadCatalogFromDb();
});

/**
 * Manual catalog refresh. Internal-only — callers must already be trusted
 * (e.g. the /api/public/hooks/sync-media route guarded by the apikey header,
 * or an admin invocation). Never exposes upstream API keys to the browser.
 */
export const refreshCatalog = createServerFn({ method: "POST" })
  .inputValidator((data: { force?: boolean } | undefined) => data ?? {})
  .handler(async ({ data }) => {
    return syncCatalog({ force: data.force });
  });