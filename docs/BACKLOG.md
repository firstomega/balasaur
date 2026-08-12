# Product backlog

Unexecuted ideas from working sessions, kept here so they survive between
sessions (Claude reads repo docs at session start — point it here and say
"build X"). Shipped work is deliberately absent; this is only what's still
open. Newest thinking wins: prune freely when an idea dies.

_Last groomed: 2026-08-11 (the seven-PR UX day, #138–#144)._

## Now / next (high conviction, scoped)

- **Daily guessing game ("Balasaurdle")** — Wordle-loop: one title per day for
  everyone, guess from a progressively revealed poster (or facts: year → genre
  → actor → tagline), 6 tries, shareable emoji-grid result. Daily ritual +
  built-in social share = the strongest single growth idea on this list. All
  data already in `media`. Self-contained; shippable in one session.
- **Taste Card / "Balasaur Wrapped"** — after ~20 ratings, a gorgeous
  shareable image: top genres, score distribution vs the crowd, favorites
  poster wall, and a dinosaur taste archetype ("Nocturnal Horror Raptor").
  On-demand + annual Wrapped moment. The Spotify-Wrapped growth loop. Needs a
  half-session of design thought before build.
- **Ticker strip** — thin Bloomberg-style ticker under the top bar with real
  catalog motion: rank deltas ("▲ Severance +4"), just-hit-streaming, titles
  added today, release anniversaries ("45 years ago today: The Shining").
  The most on-brand aliveness move available. Depends on rank-delta snapshots
  (below).
- **Rank movement deltas** — nightly snapshot of rank positions (small table:
  media_id, rank, snapped_at) → ▲/▼ arrows on Trending + ticker fodder.
- **Honest "Hide seen"** — currently filters only loaded pages client-side
  (`index.tsx`); counts stay wrong. Make it a server-side predicate now that
  statuses live in `user_media_status` (needs the user's seen ids server-side:
  pass ids or join on auth uid).
- **Public profiles / shareable lists (`/u/username`)** — deferred from the
  UX-review batch because it needs its own privacy model: usernames, opt-in
  public flag, RLS changes to expose `user_media_status` publicly, profile
  routes. A `profiles` table already exists in the schema. The organic
  acquisition loop every tracker grew on. One focused session.

## Personality & delight (the dinosaur is the moat — mostly unused)

- **Dino reactions** — deck swipe-up: quick chomp takes a bite from the poster
  corner; Not interested: tiny asteroid streak; 100th rating: celebration.
  200ms moments people screen-record.
- **Named score tiers with voice** — 90+ "Apex", 85+ "Balasaur Approved"
  (bite), <40 "Extinction event" (asteroid). Makes the score quotable; tier
  names in badge tooltips + detail popover.
- **Micro-copy voice pass** — empty states / loaders / errors: "Even the
  asteroid missed this one" > "No matches". Dino-footprint loading walk,
  fossil-dig 404.
- **Easter egg** — typing "rawr" makes the dino sprint across the screen.
  An hour of work; guaranteed screenshots.

## Aliveness

- **"Today on Balasaur"** — one algorithmic editorial slot rotated daily:
  release anniversaries, hidden gem of the day, just-hit-streaming pick.
- **"New since your last visit"** strip for returning users (store last-visit
  timestamp; diff against fetched_at / rails).

## Discovery magic

- **"Surprise me" button** — ONE perfect pick honoring services, mood, and a
  time budget ("I have 2 hours"), with a dino-roulette spin before the reveal.
  The anti-database feature.
- **Mood-based entry** — "What are you in the mood for?" chips (cozy /
  mind-bending / adrenaline / cry-it-out) mapping onto the existing themes
  taxonomy.
- **Double Feature generator** — themed pair for tonight (theme + runtime
  data already exist).
- **"Because you watched X" rail** — personalization from `user_media_status`
  - themes/sub_genres overlap, with an explanation chip ("Shared theme:
    Heist").
- **Smarter rate deck** — exclude already-rated server-side; interleave eras/
  genres for taste calibration instead of quizzing this week's chart.

## Social / sharing

- **Taste match** (needs profiles) — "You and Sam: 87% taste match" + the
  5 things they loved that you haven't seen. Two-person viral card.
- **Rich OG share cards** — per filter URL, per list, per title: poster
  collage + count + score badge, so pasted links look irresistible.
- **Watchlist availability email** — the on-site nudge banner shipped; the
  email digest ("3 watchlist titles just hit Netflix") has not. Needs an email
  provider (Resend) + weekly cron.

## Smaller UX debt

- **Score-breakdown popover on card badges** (shipped on detail page only).
- **People in global search** — merge `search_cast` hits into the top-bar
  dropdown as a second section linking to person pages.
- **Explainable "More like this"** — match detail-page rail on themes/
  sub_genres and label the connection ("Also: Time Loop").
- **Poster loading placeholders** — dominant-color or blur-up (TMDB w92)
  instead of pop-in.
- **Scroll restoration** from detail pages back into the grid (breadcrumbs
  remember the view; the scroll offset is lost).
- **"See all" per homepage rail** — needs grid-expressible equivalents
  (release-window and popularity filters don't exist in FilterState yet).
- **Season progress on TV detail** — render the `seasons` jsonb as a strip;
  later, "watched up to S3" once per-episode tracking exists.
- **Per-source rating sorts** in SortControl (deliberately held back).
- **`@types/bun` as a real devDependency** — blocked: sandbox can't reach the
  npm registry to update `bun.lock` (see `src/lib/bun-test.d.ts`, which
  stands in meanwhile).

## Availability & monetization plumbing

- **PVOD / rent-buy as first-class availability** (2026-08-12): today only
  subscription (flatrate) + free-with-ads services are derived; titles that are
  rent/buy-only look "unavailable". Plan: derive a rent_buy token set from the
  raw watch-provider `rent`/`buy` blocks, add an Availability facet to the rail
  (Streaming / Free with ads / Rent or Buy / Not available), show a "Rent/Buy"
  chip in Where to Watch, and let the streaming filter optionally include
  rent/buy. This is also the on-ramp for VOD affiliate revenue (business idea
  #3) — rent/buy click-outs are the highest-intent monetizable action.
- **Provider-on-card question** (decided against for now): no provider logos on
  grid cards — multi-provider titles and region-dependence make a single logo
  misleading, and the poster grid is already carrying type/score/trophy chips.
  Revisit as a hover-row or only when a streaming filter is active (where the
  answer is unambiguous).

## AdSense / ads readiness (corrected audit, 2026-08-12)

Already in place (earlier gap list was stale): privacy + terms pages (with
future-ads disclosure), footer, cookie banner, robots.txt, sitemap.xml,
JSON-LD, canonical URLs, SSR, balasaur.com. Remaining gaps:

1. **About + Contact pages** (E-E-A-T) and a Balasaur Score methodology page.
2. **Certified CMP**: swap the homemade banner for a TCF-registered CMP wired
   to Consent Mode v2 (easiest: Google Privacy & Messaging) before EEA ads.
3. **ads.txt** once an AdSense publisher ID exists.
4. **Thin-content**: DONE at the indexation layer (tiered sitemap + noindex on
   thin detail pages, shipped with Group 0); still needed at the content layer
   — unique data-prose module on detail pages + editorial collection pages.
5. **Layout stability**: reserve fixed-height ad slots (grid interstitial +
   detail sidebar); never style ads like poster cards.
6. **Sequencing**: verify Search Console, let the tiered sitemap index 3-4
   weeks, apply after ~50 collection pages exist. Affiliate first regardless.

## Business strategy (path to $1M/yr — 2026-08-11 session)

Anchor math: $1M/yr ≈ $83k/mo ≈ 17k subs at $5/mo, or ~2M monthly visits at
affiliate/ad yields, or (realistically) a stack of both. Letterboxd proved the
model in this vertical: free product + growth loop → Pro subs → affiliate →
data. Sequencing: SEO + affiliate first (monetizes anonymous traffic, needs no
community), then Pro once personal stats give it a spine, email as the bridge.
Trap to avoid: building monetization before traffic — monetization multiplies
an audience, it doesn't create one.

**Core stack (the credible path)**

1. Balasaur Pro ($4.99/mo, $39/yr): viewing-DNA stats, Wrapped on demand,
   unlimited saved views, advanced filters, CSV export, supporter badge.
2. Streaming click-out affiliate on Where-to-Watch (Apple/Prime bounties,
   Fandango at Home rev-share) — the JustWatch mechanic; provider data exists.
3. VOD rent/buy affiliate for titles streaming nowhere ("Rent for $3.99 →").
4. Programmatic SEO landing pages from the existing filter/URL system ("Best
   Korean thrillers on Netflix US") — the traffic engine feeding 2–3.
   Highest-leverage single build.
5. Personalized weekly email (watchlist availability + picks) with one sponsor
   slot at newsletter CPMs.

**Audience & data leverage** 6. B2B API: license the Balasaur Score + mood/theme taxonomy + availability
(tiered $99–999/mo). 7. Studio/streamer insight dashboards: anonymized taste-cohort + watchlist
conversion signal, pre-release tracking. 8. Annual "State of Streaming Taste" report — backlink/PR cannon + sponsor
vehicle. 9. White-label discovery widget (ISPs, hotel/airline portals) — one deal =
thousands of consumers. 10. The consented taste graph as enterprise/exit value (Plex, JustWatch,
Fandango, streamers) — every consumer feature compounds it.

**Product-led revenue** 11. Games as funnel: Balasaurdle free daily; archive + stats are Pro (NYT
Games playbook). 12. AI concierge tier: works-inside-Claude/ChatGPT (Lovable MCP) + in-app
natural-language picker as Pro exclusive — first mover in category. 13. Clubs: shared queue/schedule/discussion; join free, host on Pro. 14. Gift subs + family plan (holiday spike, viral vector). 15. Critic/creator program: curated lists with rev-share on driven Pro
conversions.

**Expansion & optionality** 16. Cross-media (books, podcasts, games) — the original vision; "one library
for everything" is a stronger $5/mo pitch. 17. Direct-sold "Presented by" rail sponsorships for studio launch windows
($5–15k/slot once traffic justifies). 18. International first-mover: geo-ranking already works; localize UI + SEO
pages for DE/FR/BR/JP where incumbents are weak. 19. Dino merch — margin small, brand flywheel real. 20. Pro for teams: casting agencies, film classes, shared lists/assignments
($20–50/seat).

## Platform / strategic

- **User ratings → `rating_user_avg`** — the Balasaur Score reserves 50% for
  community ratings; wire real user ratings in once volume exists (needs a
  numeric rating or the liked/disliked mapping decision).
- **Lovable MCP server ("works inside Claude/ChatGPT")** — deliberately NOT
  auto-enabled during the Group-0 pass (2026-08-12): turning it on publishes an
  external surface whose action list + access scope (everyone vs signed-in)
  are product decisions, and the generated actions need review against our
  custom Supabase auth. To enable: ask Lovable ("enable agent integrations"),
  restrict to signed-in users, review each action, publish. If the generator
  misfits, hand-build a small MCP server over the existing server functions.
- **Public API-lite** — v1 shipped (GET /api/public/v1/score?id=movie-27205:
  score + link + attribution, CORS open, CDN-cached 24h). Next: a docs page,
  more fields/endpoints if anyone uses it.
- **Google sign-in** — code shipped (PR #140), gated on `VITE_APP_AUTH_GOOGLE`;
  waiting on owner to configure the Google OAuth client + Supabase provider +
  env var. Checklist lives in PR #140's description.
