## Why you only see 1000 titles

Supabase's PostgREST API caps every response at **1000 rows by default**, regardless of what `.limit()` you pass. The catalog loader in `src/lib/media.server.ts` (`loadCatalogFromDb`, line 312) does a single `.select(...).limit(1500)`, so it silently truncates to 1000 — no matter how many titles the daily sync has added to the `media` table.

The sync code already knows about this and chunks via `.range()` when building the staleness map (see the comment at line 636). The read path on the homepage just never got the same treatment.

## Fix

Update `loadCatalogFromDb(limit)` in `src/lib/media.server.ts` to fetch in 1000-row pages with `.range(offset, offset + 999)` until it has `limit` rows (or the page comes back short). Same ordering (`popularity desc nulls last`), same column projection, same mapping — just looped.

Apply the same pagination to `loadCatalogFromCache` (line 361) so the fail-soft fallback isn't also stuck at 1000.

Bump the default `limit` from `1500` to something that matches the catalog you actually want on the home grid (e.g. `5000`). Final cap stays in your hands; the 1000-row wall goes away.

## Files

- `src/lib/media.server.ts` — paginate `loadCatalogFromDb` and `loadCatalogFromCache`, raise default limit.

No schema changes, no API changes, no frontend changes.

## What to confirm

What's the target catalog size for the homepage grid? Reasonable defaults:

- **5000** — safe, fast, covers many days of sync growth
- **10000** — larger but still snappy to JSON-serialize for SSR (my comment: this one)
- **No cap** — page until the table is exhausted (slowest first load; fine if catalog stays in the low tens of thousands)

If you don't have a preference I'll go with **5000**.