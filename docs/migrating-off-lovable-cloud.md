# Migrating balasaur off Lovable Cloud → your own Supabase project

**Status:** runbook for review. Nothing here is executed automatically.

## Why (and why now)

Lovable Cloud is a Supabase project that **Lovable owns and manages** — it exposes no
connection string or access token, so external tooling (Claude Code, CI, the Supabase
MCP) cannot see or change the database. It also only applies schema changes made inside
Lovable's own editor, so **migration files committed to this repo never reach the DB**.
That mismatch is exactly what caused the 2026-05-31 outage: PR #53 added `media.origins`
in code + a migration file, the migration never ran against Lovable Cloud, and every
catalog read started failing with `column media.origins does not exist`.

Owning the Supabase project fixes both problems: direct access, and a CI step that
auto-applies repo migrations on deploy.

**Now is the cheapest time to move.** Almost all of balasaur's data is _regenerable_, and
the only user-owned table is currently empty:

| Table               | Rows (2026-05-31) | Precious?                                                     |
| ------------------- | ----------------- | ------------------------------------------------------------- |
| `media`             | ~1,705            | No — rebuilt from TMDB/OMDb by the catalog sync               |
| `media_cache`       | ~1,308            | No — read-through cache, regenerates                          |
| `person_cache`      | ~26               | No — regenerates                                              |
| `trending_cache`    | 1                 | No — regenerates on first page load                           |
| `user_media_status` | **0**             | **Yes** — the only user-owned table, and it's empty right now |

So the usually-scary part of a backend migration (real accounts + irreplaceable data)
barely applies. It only gets harder as users sign up.

## Pre-flight

- [ ] In Lovable ▸ Cloud ▸ **Users**, confirm the auth user count. If it's just you, the
      auth migration is trivial (re-sign-up on the new project). If there are real
      signups, see Step 3c.
- [ ] In Lovable ▸ Cloud ▸ **Storage**, confirm buckets are empty. balasaur stores poster
      URLs as external TMDB links (`poster_url`), so Storage is expected to be unused — if
      so, nothing to migrate.
- [ ] Keep Lovable Cloud running until the new project is verified (Step 7). The swap is
      reversible until you delete the old project.

## Step 1 — Create the new project in your Pro org

- Supabase dashboard ▸ **New project**, and **create it inside the organization that has
  your Pro plan** (the same org as RankList.io). A project in a new org defaults to Free
  (auto-pausing, 7-day backups). Pro gives daily backups, PITR, and no pausing.
- Note the **project ref**, **API URL**, **anon/publishable key**, and **service-role key**.

## Step 2 — Recreate the schema

The repo's `supabase/migrations/` is the source of truth — apply them in order to the new
project. Easiest path:

```bash
# one-time, from the repo root
supabase link --project-ref <NEW_PROJECT_REF>
supabase db push          # applies every migration in supabase/migrations/ in order
```

Migrations as of this writing (chronological):

```
20260529211449_*.sql   20260530180000_person_cache.sql
20260529212155_*.sql   20260530192016_*.sql
20260529222902_*.sql   20260530200000_swipe_remap_skipped.sql
20260530162353_*.sql   20260531120000_media_origins.sql   ← the one that was missing in prod
```

Verify in the new project's SQL editor that `media` has the `origins` column:
`SELECT origins FROM media LIMIT 1;` (should run without error).

## Step 3 — Migrate data

**a) Catalog tables (`media`, `*_cache`) — easiest to just regenerate.**
Leave them empty and run the catalog sync against the new project (Step 7); it repopulates
`media` from TMDB/OMDb and the caches fill on first load. If you'd rather preserve exact
rows, dump just the `media` table from the old DB and restore it — but it's optional.

**b) `user_media_status` — currently 0 rows, so nothing to migrate.** The table is created
by the migrations in Step 2.

**c) Auth users.** Supabase has no one-click cross-project auth move.

- If it's just you: re-sign-up on the new project. Done.
- If there are real signups: export the email list from the old **Users** tab, then either
  invite them on the new project (Auth Admin API / dashboard) and trigger password resets,
  or have them re-register. OAuth users simply re-link on next sign-in.
  > This is the single best reason to migrate _now_, while this list is short.

## Step 4 — Storage

If Step 0 found empty buckets, skip. Otherwise recreate buckets on the new project and copy
objects (Supabase CLI or the Storage API).

## Step 5 — Repoint the app at the new project

1. **Lovable:** Integrations ▸ **Connect Supabase** ▸ select your new project. This replaces
   Lovable Cloud as the backend.
2. **Environment / keys** — update everywhere the old project is referenced:
   - Lovable env: `SUPABASE_URL`, anon/publishable key, `SUPABASE_SERVICE_ROLE_KEY`.
   - Repo `.env`: `SUPABASE_PUBLISHABLE_KEY` (the `daily-catalog-sync.yml` Action reads it).
     The anon/publishable key is public by design; the service-role key is **not** — keep it
     only in env/secret stores, never in the repo or chat.
   - App secrets that carry over: `OMDB_API_KEY`, `TMDB_API_KEY`. (`LOVABLE_API_KEY` stays
     Lovable-specific.)
3. Redeploy any **Edge functions** to the new project if used.

## Step 6 — Close the gap that caused the outage (the whole point)

Once the project is yours, two things become possible — Claude Code can set both up:

- **Direct DB visibility for Claude Code:** add a Supabase **personal access token**
  (scoped to this project) to the environment's Supabase MCP connector. Then schema checks,
  migrations, and queries can be done directly instead of the "paste-the-logs" loop.
- **Auto-apply migrations in CI:** a GitHub Actions step (e.g. `supabase db push`) keyed off
  a `SUPABASE_*` GitHub **secret** so every migration committed to the repo lands in the DB
  on deploy. With this, code can never again ship ahead of its schema.

## Step 7 — Verify

- [ ] `SELECT count(*) FROM media;` (or run the catalog sync, then re-check) is non-zero.
- [ ] Homepage at the deployed URL shows titles.
- [ ] Origin filter returns results (after the backfill populates `origins`).
- [ ] Sign-up / sign-in works against the new project.

## Rollback

Until you delete the old Lovable Cloud project, you can re-point Lovable back to it
(Integrations ▸ Connect Supabase) and restore the previous env values. Only delete the old
project after the new one is verified and has run for a few days.

## Security

Never paste the **service-role key**, DB password, or connection string into chat or commit
them to the repo — they grant full DB access. Use Lovable env, GitHub Actions secrets, or
the MCP connector config. The anon/publishable key is the only Supabase key that's safe to
expose.
