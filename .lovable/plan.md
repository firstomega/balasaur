## Balasaur — Phase 1 (Home + Data Layer + Grid)

Movies + TV only. No filters, no auth, no swipe. Real data via Lovable Cloud (Supabase) with server-side API key handling.

### Backend (Lovable Cloud)

This project is on TanStack Start, so per project conventions the "edge function proxies" will be implemented as **TanStack `createServerFn` handlers**, not Supabase Edge Functions. This keeps `TMDB_API_KEY` and `OMDB_API_KEY` server-side (read via `process.env` inside handlers) and avoids a second deployment surface. Functionally identical to the requested `tmdb-proxy` / `omdb-proxy`.

1. Enable Lovable Cloud.
2. Request two secrets via the secure secrets form: `TMDB_API_KEY` and `OMDB_API_KEY`. You'll paste them into the prompt Lovable shows — never in code or chat.
   - TMDB key: https://www.themoviedb.org/settings/api (v3 auth, the short key)
   - OMDb key: https://www.omdbapi.com/apikey.aspx
3. Server functions (in `src/lib/media.functions.ts` + helpers in `src/lib/media.server.ts`):
   - `getTrendingMedia()` — fetches `/trending/movie/week` and `/trending/tv/week` in parallel, fetches movie + TV genre lists once (cached in module scope), maps to `MediaItem[]`, then for the top N (e.g. 40) fetches `/movie/{id}/external_ids` or `/tv/{id}/external_ids` to get `imdb_id`, then calls OMDb in parallel (with a small concurrency cap) to enrich `ratings.imdb / rottenTomatoes / metacritic`. Missing scores stay `undefined`. Results merged, sorted by TMDB popularity desc, returned as a single array.
   - Streaming providers and `lengthLabel` (runtime / seasons): pulled from TMDB details where cheap; if a field is missing, it's omitted gracefully (Phase 1 grid only displays a couple of these, but the shape is populated for Phase 2).

### Data model

Exactly the `MediaItem` shape you specified, in `src/types/media.ts`. Only `'movie' | 'tv'` produced this phase; `'book' | 'podcast'` kept in the union for forward-compat.

### Genre unification

`src/lib/genres.ts` exports a `UNIFIED_GENRES` list and a `unifyGenre(name)` map, e.g.:
- "Sci-Fi & Fantasy" → "Science Fiction"
- "Action & Adventure" → "Action"
- "War & Politics" → "War"
- TV "Kids" → "Family", etc.

Applied during TMDB→MediaItem mapping so the grid (and Phase 2 filter) treat them as one.

### Frontend

Design tokens added to `src/styles.css` (oklch equivalents of the hex palette, exposed as semantic tokens — `--background`, `--card`, `--border`, `--foreground`, `--muted-foreground`, `--primary` blue, `--rating` green, plus `--media-movie/tv/book/podcast` accent dots). Fonts: Archivo + JetBrains Mono via Google Fonts `<link>` in `__root.tsx` head. No Inter, no system fallback in tokens.

Components (`src/components/balasaur/`):
- `TopBar.tsx` — wordmark "balasaur" (JetBrains Mono lowercase) + tiny friendly dino glyph (inline SVG, rounded/cute, not skeletal); center search input (visual only, disabled-feeling but focusable); right nav "Browse / Lists" as text links + "Sign in" as blue primary button. Collapses on mobile (hide center search, condense nav).
- `MediaGrid.tsx` — `grid-template-columns: repeat(auto-fill, minmax(142px, 1fr)); gap: 13px;`
- `MediaCard.tsx` — 2:3 poster, top-left media-type tag (uppercase, colored per accent), top-right `★ 8.6` rating badge (mono, green) using IMDb else TMDB; below art: title (Archivo bold) + `{year} · {Type}` (mono muted). Subtle hover lift + shadow.
- `MediaCardSkeleton.tsx` — for loading state.

Route (`src/routes/index.tsx`): replaces placeholder. Uses TanStack Query canonical pattern — `queryOptions` + `ensureQueryData` in loader + `useSuspenseQuery` in component. Hook `useMediaItems()` wraps the query for reuse. `errorComponent` + `notFoundComponent` set. Updated `<head>` meta (title "Balasaur — cross-media discovery", description, og tags).

### File map

```text
src/
  types/media.ts
  lib/
    genres.ts
    media.functions.ts    // createServerFn: getTrendingMedia
    media.server.ts       // TMDB + OMDb fetch helpers, mappers
  hooks/useMediaItems.ts
  components/balasaur/
    TopBar.tsx
    DinoMark.tsx
    MediaGrid.tsx
    MediaCard.tsx
    MediaCardSkeleton.tsx
  routes/index.tsx        // rewritten
  routes/__root.tsx       // add font links in head()
  styles.css              // palette + font-family tokens
```

### Out of scope (deferred)

Filters, sidebar, auth, swipe, books, podcasts, square-art blurred backfill, detail pages.

### What I'll need from you

After you approve: confirm so I can (1) enable Lovable Cloud, (2) trigger the secure form for `TMDB_API_KEY` and `OMDB_API_KEY`. Once both are pasted, I'll build everything above in one pass.