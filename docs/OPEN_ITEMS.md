# Open items

Written 2026-08-17. What is unfinished, who it is waiting on, and why it
matters. Newest thinking wins; prune when an item dies.

## Waiting on the owner

- **Merge and deploy PR #172** (media-type split, two-rail homepage). Built,
  CI green, not merged. The layout check's screenshots on that PR are the
  first real look at the two-rail homepage.
- **Confirm `balasaur@ranklist.com` is an inbox you receive.** It is public on
  /contact and the account is on `.io`. Licensing and ad-network mail goes
  there.
- **Add the three sitemaps as separate rows in Search Console:**
  `sitemap-pages.xml`, `sitemap-titles.xml`, `sitemap-people.xml`. Only
  `sitemap.xml` is submitted, so coverage cannot be read per page family.
- **Bing Webmaster Tools:** confirm the IndexNow tab shows the 9,346 URLs
  submitted on 2026-08-14.
- **Optional:** add `APP_SUPABASE_SERVICE_ROLE_KEY` as a repo secret so the
  layout check renders catalog pages instead of empty shells.

## Decisions the owner needs to make

- **How wide should the index be?** See "The indexing gate is wrong" below.
  This is a strategy call, not a bug fix, and it is the most consequential
  open question.
- **Occasion names.** `docs/OCCASIONS.md` was drafted and shipped without a
  red-pen pass. Renaming is a one-field database update; the slug never moves.

## Known problems, not yet fixed

- **The indexing gate excludes pages that were ranking.** Detailed below.
- **One server error (5xx)** in Search Console coverage. The URL is not in the
  export; it needs the Coverage report UI to identify.
- **15 pages "Alternate page with proper canonical tag", validation Failed.**
  Likely the bare-id detail URLs versus their slugged canonicals, but
  unconfirmed.
- **Ranking for piracy-format queries.** Search Console shows impressions for
  "andor warez", "prime rewind s01 bd25", "bdscr", "workprint", "h255",
  "ac3". Nothing on the site invites these; Google is matching title text.
  Not a policy violation, but it is a bad neighbourhood to compete in and
  worth watching before an ad-network review.
- **Zero clicks on 476 impressions in twelve months**, including 29
  impressions for the brand query "balasaur" at average position 4.6. Whatever
  the snippet looks like at that position, nobody is clicking it.
- **The v8 migration record does not reproduce its function body.** Stated in
  the file with a verification hash; production is authoritative.
- **Second React hydration error** (the HTML variant of #418) still
  unidentified. Needs source maps, which are still disabled.
- **Contrast failures** on the Sign in button and several footer strings.

## The indexing gate is wrong, and it is mine

The corroboration gate shipped on 2026-08-14 requires 250+ TMDB votes or a
critic score. Checked against the Search Console performance export on
2026-08-17: **eleven of the thirteen best-performing pages now carry
noindex.** Roughly 270 of 476 total impressions sit on pages the gate
excludes, several of them ranking on page one:

| Page | Impressions | Position | Still indexable |
| --- | --- | --- | --- |
| El cor de la ciutat | 22 | 43.7 | no |
| Be My Guest with Ina Garten | 19 | 7.1 | no |
| Testament: The Bible in Animation | 16 | 5.9 | no |
| The Great British Bake Off: An Extra Slice | 14 | 32.0 | no |
| The Patient | 6 | 7.5 | no |
| Yalan Dünya | 5 | 6.4 | no |
| Captain Planet and the Planeteers | 69 | 9.5 | yes |
| Andor | 6 | 16.5 | yes |

The mechanism is not a threshold that is merely too high. The rule reads
`coalesce(vote_count, 0) >= 250`, which **turns unknown into zero**. 23,436
catalogued titles have no vote count fetched at all, and those are not
unpopular titles, they are unmeasured ones. The Patient is an Apple TV+ drama
starring Steve Carell. It failed because a number is missing, which is exactly
the error the rest of this codebase avoids: the prose layer omits a sentence
when a fact is missing rather than asserting something false about it.

Second contributing factor: the titles sitemap orders by
`vote_count desc nulls last`, so every unmeasured title sorts behind every
measured one and never reaches the 2,500 cap.

### Options, measured against the live catalog

| Rule | Titles indexable |
| --- | --- |
| No gate (art + synopsis + score only) | 58,711 |
| **Today:** 250+ votes or a critic score | 18,500 |
| Unknown passes, plus 100+ votes or a critic score | 37,433 |
| Unknown passes, plus 25+ votes or a critic score | 43,224 |

15,487 titles have a **known** vote count under 25 and no critic score. Those
are the ones there is real evidence nobody cares about, and excluding them is
defensible. The other 16,915 are simply unmeasured.

### Recommendation

Stop treating a missing vote count as a zero, and set the numeric floor at
100. That lands near 37,400 indexable pages, restores every page that was
ranking, and still excludes the 15,487 titles with measured low interest.

The argument for keeping it strict was site-level quality for an ad-network
review. The counter-evidence: Google has **discovered 10,337 URLs and indexed
287**. Google is already doing the filtering, so our own noindex is not what
constrains indexation; it is only removing pages that had earned a position.

Also fix the sitemap ordering so unmeasured titles are not sorted last.

## Backlog, unstarted

- Heat scoring and person collections ("Best Tom Holland Movies" minting
  itself when he trends). `person_index` already exists as the substrate.
- The thirteen depth ideas in `docs/CONTENT_DEPTH.md`, starting with the five
  that need no new data.
- Split origin-genre collections by media type ("Best Korean Dramas").
- A K-drama shelf. Rom-coms measured 38 series to 22 films before being
  declared film-only; the K-dramas that dominated it deserve their own page.
- Ranking canary in the nightly job.
- Copy lint in CI (em-dashes and explainer phrasing across all of `src`).
- Source maps in the production build.
- Balasaurdle, taste cards, public profiles.
