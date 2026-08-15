# Page depth without padding

Written 2026-08-15 after a third-party AdSense audit warned that the average
page runs 361 words and "AdSense favors text-rich content. Aim for 800+ words
per article page."

## The premise is half wrong, and the half that is right matters

That advice is written for blogs. IMDb, Rotten Tomatoes, and JustWatch pages
are not 800 words either, and they rank. Google's published policy asks for
value, not volume, and a database page delivers value as facts.

The half that is right: our pages genuinely are thin on *claims*. A title page
today says a handful of true things and then hands the reader a borrowed TMDB
synopsis. That is thin in the way that matters, and no amount of prose about
"the magic of cinema" would fix it.

So the rule for every idea below: **more facts, never more adjectives.** If a
sentence would be true on a competitor's page, it does not ship.

## Where the depth actually is

Every item below is a claim only this database can make, composed
deterministically the way `titleProse.ts` and `collectionsProse.ts` already
work. No language model writes a sentence a visitor reads.

### Title pages

1. **Percentile claims.** "Scores higher than 94% of 2010s thrillers." Needs
   materialized percentiles per genre and per decade. The strongest single
   originality claim available to us.
2. **Collection membership.** "Appears in 7 ranked lists here, including Best
   Thrillers on Netflix (#3)." Already computable from `collection_items`, and
   it doubles as internal linking.
3. **Rank inside its own year and genre.** "The 4th highest scoring horror
   film of 1980."
4. **Cast and crew context.** "Director X has 9 titles in this catalog, median
   score 71. This is their highest."
5. **Season-by-season for TV.** Per-season air years and episode counts are
   already stored in `seasons`.
6. **Franchise context.** 3,853 titles carry a TMDB collection id: "Third of
   six in the series, and the highest scoring of them."
7. **Availability history.** "Arrived on Netflix in the last 30 days." Needs a
   streaming-change log the nightly sync could write.

### Collection pages

8. **Distribution.** "Scores run 94 down to 71, median 78. Half the list is
   from the 2010s."
9. **Composition.** "Nine of the 28 also stream on Max."
10. **Movement.** "Four titles entered this list in the last month; two left."
    Needs a nightly membership snapshot, which the rank-delta work also needs.

### Person pages

11. **Filmography statistics.** "34 catalogued titles, median score 68, best
    decade the 1990s."
12. **Frequent collaborators.** "Has worked with X on 6 of them."
13. **Range.** "Most often in crime dramas, but the highest scoring title is a
    comedy."

## What we will not do

- Padding the homepage. It is a tool; a visitor arrives to dive in, not to
  read. Its job is to get out of the way.
- Generic prose written by a model and passed off as editorial.
- Comment sections or user-generated content while there are no users. An
  empty comment box is worse than none.
- Chasing a word count as a target. If the facts run out, the page ends.

## Sequencing

Items 2, 8, 9, 11, and 12 need no new data and could ship in one session
each. Items 1, 3, and 6 need a materialized percentile or franchise table.
Items 7 and 10 need nightly snapshots and should wait for the rank-delta work
they share a mechanism with.
