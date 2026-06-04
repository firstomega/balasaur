# Handoff — Advanced Filters: finish the catalog backfill

**Date:** 2026-06-04
**From:** Claude Code session without Lovable access (Supabase MCP here only reaches the
unrelated *RankList.io* project, **not** balasaur).
**To:** Claude Code session **with the Lovable MCP enabled** (can reach balasaur's DB +
deploys).
**Branch with the fix:** `claude/loving-edison-5DXK6` (draft PR open against `main`).

---

## TL;DR

The Advanced Filters feature is built and the database schema is live, but the filter
**counts are only partially populated** because the one-time backfill **stalls after
~1,000 titles** on a database read timeout. A code fix for that stall is ready on this
branch. The remaining work needs Lovable access, which this session doesn't have — hence
the handoff.

**What you (the receiving agent) need to do:**
1. **Verify** current facet population directly against balasaur's DB (SQL below).
2. **Deploy** the backfill fix on `claude/loving-edison-5DXK6` (merge → Lovable redeploy,
   or apply the same change inside Lovable).
3. **Re-run** the "Catalog fill (loop)" workflow with *backfill* ticked (or drive the
   backfill endpoint) until it reports `done: true`.
4. **Confirm** counts populate on balasaur.com after a hard refresh.

---

## What we're building & how counts work

Advanced Filters add five facets to the catalog: **Sub-Genre, Themes, Audience, Film
Length, Series Status (completion)**. They are derived — with **no new external API
calls** — from data already stored in `media.raw_tmdb` (keywords / certifications /
runtime / status) by `deriveFacets()` in `src/lib/taxonomy.ts`.

- Storage: 5 columns on `public.media` — `sub_genres text[]`, `themes text[]`,
  `audience text[]`, `film_length_minutes int`, `completion_status text`.
- Counts: the `catalog_facets_filtered(p jsonb)` Postgres RPC aggregates those columns.
- Writes: `rowFromEnrichedItem()` (`src/lib/media.server.ts`) writes the facets on every
  sync; `backfillFromRaw()` re-derives them for existing rows from stored raw payloads.

## The architecture constraint (read this first)

balasaur runs on **Lovable Cloud**, whose Supabase project Lovable owns. Per
`docs/migrating-off-lovable-cloud.md`:

> *Lovable Cloud … exposes no connection string or access token, so external tooling
> (Claude Code, CI, the Supabase MCP) cannot see or change the database. It also only
> applies schema changes made inside Lovable's own editor, so **migration files committed
> to this repo never reach the DB**.*

Consequences:
- **DB migrations do NOT auto-apply.** They must be run inside Lovable. (This already
  caused the 2026-05-31 `media.origins` outage.)
- **App code DOES deploy** through the normal Lovable build from `main`.
- This session's Supabase MCP is connected to the user's *other* project (RankList.io) —
  it has no `media` table. **You** (with Lovable MCP) are the one that can actually see
  balasaur's DB.

---

## What's already been done

1. **Schema patch applied via Lovable — confirmed live.** The two migrations
   (`20260603120000_advanced_filters.sql` = the 5 columns + GIN indexes, and
   `20260603130000_advanced_facets_rpc.sql` = the updated `catalog_facets_filtered` RPC)
   were applied through Lovable.
   **Evidence it's live:** the backfill's page `SELECT` lists those new columns
   (`media.server.ts:867`). If they didn't exist the call would error; instead workflow
   run #13 returned `HTTP 200` and scanned rows — so the columns exist.

2. **Backfill workflow run #13 ("Catalog fill (loop)", backfill ticked):**
   - Backfill pass 1: `scanned:800 … durationMs:108247 lastId:"movie-10611" done:false`
   - Backfill pass 2: `scanned:200 … durationMs:39743  lastId:"movie-1075"  done:false`
   - Backfill pass 3: `scanned:0   … durationMs:14865  lastId:"movie-1075"  done:false`
   - → workflow logged **"No further progress (lastId unchanged) — stopping at pass 3."**
   - So only ~1,000 titles got tagged before it gave up.
   - Then the separate **"Fill loop" failed**: `sync pass 2 failed with HTTP 000000
     (after retries)` → job exit 1 (the red ❌). See "Secondary issue" below.

---

## Diagnosis

### Primary: the backfill stalls on a read timeout (this is what blocks counts)

`backfillFromRaw()` pages through `media` by `media_id`, and each page `SELECT` pulls the
**entire `raw_tmdb` + `raw_omdb` JSON blobs** for 200 rows at once. Past `movie-1075`
some titles carry very large payloads, so the page read exceeds the statement timeout
(note pass 3's `scanned:0` with `durationMs ~15s` and an unchanged cursor = the select
failed, not end-of-data — `done` stayed `false`).

The **old** code aborted the *entire* backfill on the first such error (`break`), which
strands every row after the heavy one. That's why the cursor never advanced past
`movie-1075` and the workflow stopped.

### Secondary (separate, not blocking counts): Fill loop `HTTP 000`

The "Fill loop" POSTs `/api/public/hooks/sync-media` to ingest **new** titles from TMDB.
`HTTP 000` = curl got no response within `--max-time 300` (the endpoint timed out /
connection dropped), retried 4× same result. This is about *adding new movies*, not about
tagging the existing catalog, so it does **not** block the filter counts. Likely the sync
pass occasionally exceeds the host gateway timeout. Worth a separate look (e.g. lower the
per-pass batch size `MAX_ENRICH_PER_RUN`, or shorten `--max-time` with more passes) but
**out of scope for getting counts working.**

---

## The fix (already on this branch)

`src/lib/media.server.ts` → `backfillFromRaw()`: make the page size **adaptive** so one
heavy page can't kill the whole run.

- On a page-select error, **shrink** the page (`÷4`, floor 10) and retry — inch through
  the heavy region instead of aborting.
- **Recover** the page size (`×2`, cap 200) after a clean page so the rest of the catalog
  isn't crawled.
- If even the smallest page keeps failing, **step the cursor forward by one id** (a cheap
  id-only read) and count that row as `failed`, so a single pathological row can't wedge
  the entire catalog.

Net effect: every call now makes forward progress, the workflow's "lastId unchanged" stop
won't misfire, and the backfill runs to `done: true`. The change is purely operational —
it cannot produce wrong facet data (it only changes *how many rows per read*), and eslint
is clean.

```diff
-  const PAGE = 200;
+  const MAX_PAGE = 200;
+  const MIN_PAGE = 10;
+  let pageSize = MAX_PAGE;
   let cursor = opts?.after ?? "";
   while (true) {
     const { data, error } = await supabaseAdmin
       .from("media")
       .select( /* …, raw_tmdb, raw_omdb */ )
       .gt("media_id", cursor)
       .order("media_id", { ascending: true })
-      .limit(PAGE);
+      .limit(pageSize);
     if (error) {
-      console.error("[backfill] select failed:", error.message);
-      break;
+      if (pageSize > MIN_PAGE) {                       // shrink + retry
+        pageSize = Math.max(MIN_PAGE, Math.floor(pageSize / 4));
+        continue;
+      }
+      // even min page fails → step cursor past one row by id, mark failed, continue
+      const { data: step } = await supabaseAdmin.from("media").select("media_id")
+        .gt("media_id", cursor).order("media_id", { ascending: true }).limit(1);
+      if (!step?.length) { result.done = true; break; }
+      result.failed++; cursor = step[0].media_id; result.lastId = cursor; continue;
     }
     /* … */
-    if (data.length < PAGE) { result.done = true; break; }
+    if (data.length < pageSize) { result.done = true; break; }
+    if (pageSize < MAX_PAGE) pageSize = Math.min(MAX_PAGE, pageSize * 2);  // recover
```

(See the full, exact change in the PR diff.)

---

## Your step-by-step (with Lovable MCP)

### 1. Verify current state directly
Run against balasaur's DB:
```sql
select
  count(*)                                                           as total_rows,
  count(*) filter (where coalesce(array_length(sub_genres,1),0) > 0) as has_sub_genres,
  count(*) filter (where coalesce(array_length(themes,1),0) > 0)     as has_themes,
  count(*) filter (where coalesce(array_length(audience,1),0) > 0)   as has_audience,
  count(*) filter (where film_length_minutes is not null)           as has_film_length,
  count(*) filter (where completion_status is not null)             as has_completion
from public.media;
```
Expectation **before** the fix runs: `has_*` ≈ 1,000 while `total_rows` is much larger →
confirms the partial backfill. (If `has_*` ≈ `total_rows` already, the catalog may be
small and you can skip straight to UI verification.)

### 2. Get the fix deployed
- Preferred: merge PR `claude/loving-edison-5DXK6` → `main`, let Lovable rebuild
  balasaur.com. Confirm the deploy picked up the new `backfillFromRaw`.
- If GitHub→Lovable sync isn't wired, apply the same `media.server.ts` change inside
  Lovable's editor (the diff above is the whole change).

### 3. Run the backfill to completion
Actions ▸ **Catalog fill (loop)** ▸ Run workflow ▸ tick **"Run one backfill pass first."**
With the fix, backfill passes should now advance past `movie-1075` and eventually print
`✅ Backfill complete` (`done:true`). It's resumable and skip-unchanged, so re-running is
cheap and safe. (You could instead drive `POST /api/public/hooks/backfill-media` directly,
threading `{after:lastId}`, gated by `SYNC_HOOK_SECRET`.)

### 4. Verify
- Re-run the SQL in step 1 → `has_*` should now ≈ `total_rows`.
- Hard-refresh balasaur.com → Themes / Audience / Film Length / Series Status show
  non-zero counts; Sub-Genre appears once a genre is selected.
- The grid cache is busted automatically by the backfill when rows change
  (`media.server.ts` deletes `trending_cache` key `trending`).

---

## Reference — the schema patch (already applied; idempotent, safe to re-run)

Columns (full file: `supabase/migrations/20260603120000_advanced_filters.sql`):
```sql
ALTER TABLE public.media
  ADD COLUMN IF NOT EXISTS sub_genres          text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS themes              text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS audience            text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS film_length_minutes integer,
  ADD COLUMN IF NOT EXISTS completion_status   text;
-- + GIN/btree indexes (see migration file)
```
The counting function is the full `create or replace function catalog_facets_filtered`
in `supabase/migrations/20260603130000_advanced_facets_rpc.sql`.

---

## Key files
| File | Role |
| --- | --- |
| `src/lib/media.server.ts` | `backfillFromRaw()` (**fixed here**), `rowFromEnrichedItem()` (writes facets on sync) |
| `src/lib/taxonomy.ts` | `deriveFacets()` — raw_tmdb → sub_genres/themes/audience/film_length/completion |
| `src/lib/catalog.functions.ts` | `queryCatalog()` — consumes the facet columns/RPC |
| `supabase/migrations/20260603120000_advanced_filters.sql` | the 5 columns + indexes |
| `supabase/migrations/20260603130000_advanced_facets_rpc.sql` | `catalog_facets_filtered` RPC |
| `.github/workflows/catalog-fill.yml` | the backfill + sync loop (run #13 here) |
| `docs/migrating-off-lovable-cloud.md` | architecture + the "own your DB" runbook |

## Unrelated security finding (noted, NOT acted on)
While probing this session's Supabase MCP I hit the user's **RankList.io** project (not
balasaur). Its table `public.entity_image_decisions` has **RLS disabled** → exposed to the
anon key. Remediation needs `ENABLE ROW LEVEL SECURITY` **plus** policies (enabling
without policies blocks all access). Flagging for the user; unrelated to this effort.

## Bigger picture
All of this friction (can't see the DB, migrations don't auto-apply, two-system handoffs)
is exactly what `docs/migrating-off-lovable-cloud.md` exists to end. The user has chosen
"patch now, move later" — this handoff is the "patch now." The "move later" (balasaur onto
the user's own Supabase Pro org, same org as RankList.io) remains the durable fix.
