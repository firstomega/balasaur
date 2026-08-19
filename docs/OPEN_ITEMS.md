# Open items

Rewritten 2026-08-19 during the overnight session. What is unfinished, who it
is waiting on, and why it matters. Newest thinking wins; prune when an item
dies. The previous version of this file was written 2026-08-17; everything it
listed as broken about the indexing gate was fixed on 2026-08-17/18 (substance
gate, 57,469 indexable titles) and is gone from here.

## Waiting on the owner (none of this blocks the site)

- **Confirm `balasaur@ranklist.com` is an inbox you receive.** It is public on
  /contact and the account is on `.io`. Licensing and ad-network mail goes
  there. Flagged three times now.
- **Add the three sitemaps as separate rows in Search Console:**
  `sitemap-pages.xml`, `sitemap-titles.xml`, `sitemap-people.xml`, so coverage
  reads per page family.
- **Bing Webmaster Tools:** confirm the IndexNow tab shows the submissions
  (9,346 URLs on 2026-08-14; the nightly ping keeps adding). Never rotate the
  IndexNow key from the Bing UI.
- **Add `APP_SUPABASE_SERVICE_ROLE_KEY` as a repo secret** so the layout check
  renders catalog pages instead of empty shells.
- **One 5xx and the "alternate page with proper canonical" validation** in
  Search Console need the Coverage UI (owner access) to identify.
- Optional signups when ready: Sentry (or any error tracker), an analytics
  tool (PostHog/Clarity), Resend (unblocks the watchlist email digest).

## Decisions the owner needs to make

- **Occasion names.** `docs/OCCASIONS.md` shipped without a red-pen pass.
  Renaming is a one-field update; slugs never move.
- **"Ranked for {country}" chip.** You once said geo bias should be silent;
  the chip is also the toggle to global ranking. Keep or cut, one line.
- **Taste ramp ("Pick 5 you love")** still exists behind the homepage hero
  button. You said you did not like it; say cut and it goes.
- **Deferred features you parked:** rate-deck verb rehaul (after you judge
  the side-by-side deck), gamification, community, movie night, PWA extras.
  Say "what's next for us to do" and the written plans come back out.

## Known problems, not yet fixed

- **Second React hydration error** (the HTML variant of #418). Production
  source maps shipped 2026-08-19, so the next occurrence in a browser console
  will name a component. Needs a browser repro on the live site.
- **"Hide seen" counts are still client-side** on the homepage grid: it
  filters only loaded pages, so the results total does not shrink. The honest
  server-side version needs the viewer's seen ids server-side; designed, not
  built.
- **Piracy-format queries** ("bd25", "workprint") still earn impressions.
  Nothing on the site invites them; watch before any ad-network review.

## Backlog, unstarted

- Rank movement deltas (nightly rank snapshot) and the ticker strip.
- Availability facet for rent/buy-only titles (PVOD) + per-provider watch
  links behind the /go affiliate plumbing (designed, not built).
- Score-breakdown popover on card badges (detail page has it).
- People in the top-bar search dropdown as a second section.
- Poster loading placeholders (blur-up).
- CONTENT_DEPTH items still open: availability history, collection movement
  (both need nightly snapshots the rank-delta work also needs).
- Balasaurdle archive/stats, taste cards ("Wrapped"), public profiles.
