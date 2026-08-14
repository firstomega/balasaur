// IndexNow: tell search engines a URL changed instead of waiting to be crawled.
//
// Why this matters more than it looks. ChatGPT search and Copilot answer from
// Bing's index, and Perplexity leans on it too, so Bing coverage decides
// whether an AI assistant can cite this site at all. Bing takes new domains
// far faster than Google does, and IndexNow is a push: one POST names the URLs
// that changed and participating engines (Bing, Yandex, Seznam, Naver) all
// receive it.
//
// The submission runs from Postgres, not from CI. The catalog already rebuilds
// nightly inside the database on pg_cron, so the ping belongs next to the job
// whose output it announces. See supabase/migrations for ping_indexnow().

/**
 * Ownership key, published at /<key>.txt. Public by design: it authorizes
 * announcing URLs on this host and nothing else. The route filename must match
 * this value, so the two change together.
 */
export const INDEXNOW_KEY = "d50e38be1b86ef6ef1079ff766aa2079";

/** Shared endpoint. Submitting here fans out to every participating engine. */
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
