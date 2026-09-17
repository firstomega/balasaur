# Getting from impressions to clicks

## What the data says

Search Console, Aug 17 to Sep 13: 840 impressions, 0 clicks, average position 72.

- Every page sampled (homepage + three /best/ collections) is indexed and crawlable. Sitemap is sorted by rating count, structured data is in place, title pages link back to collections. Nothing technical is broken.
- The problem: pages rank on page 7 to 8 of Google, where almost nobody looks. At position 72, Google rarely even shows the listing, which is why 2,500 submitted pages produced only 840 impressions.
- Cause: balasaur.com is a new domain with no track record and few or no outside links, competing for "best X movies" against IMDb, Rotten Tomatoes, and JustWatch. Google does not yet trust it enough to put it on page 1.

This means the fix is not titles, snippets, or CTR tweaks. Nothing is being seen, so nothing can be clicked. The fix is choosing winnable searches and building trust over months.

## The plan

### 1. Aim new collections at searches the big sites ignore (main lever)

The /best/ engine already works; the question is which slugs it mints. "Best movies on Netflix" is unwinnable this year. Multi-facet crosses ("best chinese comedies", "best crime movies on tubi") are exactly where Balasaur already gets impressions, and where IMDb has no dedicated page.

- Run Semrush keyword research on the "best ___ movies/shows" pattern family (free services like Tubi, genre + country crosses, genre + decade crosses) and pull phrases with real volume and low difficulty.
- Mint roughly 15 to 25 new collections for the winnable phrases, gated on genuine distinctness per the gate-is-the-curator rule: a collection ships only if its ranked list is defensible.
- Retire or merge any existing collections whose ranked lists are thin or interchangeable.

### 2. Strengthen what each collection page says

Pages that are TMDB metadata plus a poster get demoted; original data-prose is the house answer.

- Extend the collectionsProse pattern so each /best/ page opens with two or three sentences only this database can make (how the top pick separates from the pack, where the sources disagree, what the list's floor score is).
- Keep each sentence a claim a viewer would repeat, not a description of the pipeline.

### 3. Measure on a monthly cadence, not daily

Search Console data lags and a new domain moves slowly. Check clicks, impressions, and average position once a month; the goal for the next quarter is average position under 40 on the collection family, not traffic numbers.

### 4. Trust-building the site cannot do itself (owner tasks, listed for completeness)

These need a human, so they are outside the code work: submit the games (Balasaurdle etc.) to a few directories and communities as linkbait, and list the site on Product Hunt or similar. Outside links are the single strongest ranking input and the one no code change provides.

## Out of scope

- No title/meta rewrites: at position 72, snippet wording changes nothing.
- No sitemap or indexing changes: both are already correct.
- No new page families: indexation quality beats page count.

## Technical notes

- Keyword picks come from the built-in Semrush tools (keyword_research, keyword_compare, serp_analysis), US database.
- New collections are data work in the existing collections pipeline; the /best/$slug route needs no changes.
- Success check after shipping step 1 and 2: the new slugs appear in Search Console's page list within a few weeks and the family average position trends down month over month.
