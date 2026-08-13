# Balasaur: operating principles

Read this before writing anything. It governs every new feature and every
modification to an existing one. It exists because the same feedback was
being given repeatedly about different features, which meant the problem was
never the feature.

## How to use this file

Before you build: read the principles, then write down which ones the change
touches and how you will satisfy them.

Before you ship: run the pre-ship gate at the bottom. If a check fails, the
work is not done, regardless of whether tests pass.

**How to update this file (this matters more than any single rule).** When
the owner gives feedback, the instinct to resist is "fix that thing." Instead:

1. State the feedback as a general claim about the product, not the instance.
   "This breadcrumb says nothing" becomes "UI that restates what the user can
   already see is noise."
2. Find the smallest existing principle that would have prevented it. Amend it.
3. If none exists, add one. Give it a check that can be answered yes or no.
4. Do that in the SAME change as the instance fix, never later.

A principle without a check is decoration, which violates Principle 1. Every
principle here has a check.

## What this product is

A movie and TV discovery database. ~66,000 titles from TMDB and OMDb,
refreshed nightly. Its one differentiated asset is the Balasaur Score, a
0 to 100 blend of IMDb, Rotten Tomatoes, Metacritic, and TMDB. Everything
else on the site is commodity data that a dozen competitors also have.

Run by one person, part time, with no marketing budget and no social posting.
Traffic comes from search. That constraint decides most arguments: work that
compounds without a human in the loop beats work that needs attention.

---

## The principles

### 1. Earn the pixel

Every element must justify its existence against being deleted. When you find
yourself adding UI that explains a problem, delete the problem instead.

**Check:** If I removed this, what would a real user be unable to do? If the
honest answer is "nothing, they just would not be told X," then fix X.

_This is the most-violated principle. A banner explaining why rails
disappeared, a breadcrumb reading "All Titles > Drama > All Titles", a
"+55 more" truncation, a second search box. Each was UI apologizing for a
design decision that should have been reversed._

### 2. Design for one specific person in one specific state

Not "the user." Name them: a first-time visitor from a Google search, signed
out, on a 390px phone, who has never heard of a Balasaur Score and did not
ask how the site works.

**Check:** What does this person think in the first two seconds? Write the
sentence. If the sentence is a question ("what does this number mean?"), the
design is not finished.

### 3. Every visible number must survive a skeptic

If a number is on screen, a stranger must be able to reconstruct why it is
what it is from what else is on screen. Ranking is a promise; an unexplainable
order reads as broken and costs trust that the score cannot afford.

**Check:** Can someone explain why item 1 is above item 2 using only what is
visible? If ordering uses a hidden value, either show the value or order by
the shown one.

### 4. State the fact, do not explain the mechanism

Copy asserts something only this database knows. It never narrates the
feature, never describes the pipeline, never pads. No em-dashes. No
"powered by," "seamlessly," "curated," "leverage." If a sentence would be
true on a competitor's site, delete it.

**Check:** Is this a claim, or a description of how the site works? Would a
person say it out loud to a friend? Machine-sounding copy is not a style
problem here; it is an existential one, because thin derivative content is
exactly what gets a database site rejected by ad networks and demoted by
search.

### 5. Judge the rendered page, not the component

Correct code and a good page are different achievements. Density, grouping,
whitespace, and overflow only exist in the rendered whole, at real viewport
widths, with real and ideally ugly data.

**Check:** Have I seen this at 390px and at 1440px with real rows, including
the worst-looking real row? Types compiling is not evidence.

### 6. Shape follows the data

A cross of two facets is a table. A sequence is a timeline. A ranked set is a
list. Forcing everything into stacked lists is how a page starts looking like
a database admin panel.

**Check:** Am I choosing this layout because it fits the data, or because it
was the easiest thing to render?

### 7. The gate is the curator

Prefer systems that produce quality by refusing to produce bad output over
either hand-curation or volume. Generation must be gated on genuine
distinctness, not on a count.

**Check:** Does this scale without the owner thinking about each instance, and
does it refuse to emit a weak instance? 2,000 pages that are all defensible
beat 40,000 where most are not, both for users and for search.

### 8. Name the rent each surface pays

Every surface earns its keep in at least one of: search acquisition, user
trust, or retention. If a change serves none of them, it is a hobby.

**Check:** Which one, and what specifically is the mechanism? "It looks nicer"
is retention only if you can say what a user does differently.

### 9. Subtract on every pass

A change should leave the surface simpler or equally simple. Complexity added
without complexity removed compounds until the page reads as busy.

**Check:** What did I remove in this change? If nothing, justify it.

### 10. Ship evidence, not adjectives

"Done," "fixed," and "verified" mean something was observed. Say what you
observed and what you did not. When a claim cannot be verified in the current
environment, say so plainly rather than implying coverage.

**Check:** For each claim I am about to make, what exactly did I look at?

---

## Business posture, current phase

These are conditions of the moment, not permanent truths. Revisit when
traffic changes.

- **Traffic precedes monetization.** No display or affiliate channel produces
  meaningful revenue below roughly 3,000 sessions per month. Building
  monetization plumbing early is fine; applying to programs early is not,
  because rejections can be permanent.
- **Indexation quality beats page count.** Programmatic pages on a new domain
  commonly land at 28 to 40% indexed. Raising that rate is worth more than
  generating more pages, and generating template-similar pages at volume is
  an active risk after recent search updates.
- **Originality is a licensing and monetization gate, not a nicety.** Pages
  that are TMDB metadata plus a poster fail ad-network content review. The
  deterministic data-prose pattern in `src/lib/collectionsProse.ts` is the
  house answer: every sentence a claim only this database can make. Extend
  that pattern rather than inventing a second voice.
- **Automation over attention.** The owner's time is the scarcest input. A
  feature that needs weekly human curation is more expensive than it looks.

---

## Pre-ship gate

Run through this before saying a change is done.

1. **Principles touched.** Which ones, and how did I satisfy each?
2. **Subtraction.** What did I remove?
3. **Rendered check.** Seen at 390px and 1440px with real data, or explicitly
   stated as unverified and why.
4. **Copy pass.** No em-dashes, no mechanism-explaining, no adjective padding
   in any user-visible string, including empty states, tooltips, aria-labels,
   page titles, and meta descriptions.
5. **Number check.** Every visible number is reconstructable from the page.
6. **Data check.** Looked at actual output rows, not just the query. Ranked
   output was eyeballed for titles a real person would recognize.
7. **Gates.** `bunx prettier --write` on changed files, `bun test src`,
   `bunx tsc --noEmit`, and CI green before merge.

---

## Mechanical house rules

- Never use an em-dash in user-visible text. Periods, commas, colons.
- Do not add npm dependencies without asking. The client bundle is already
  heavy.
- `src/routeTree.gen.ts` is generated. Add a route file, run `bun run dev`
  briefly to regenerate, never hand-edit.
- Database changes are applied to the live Supabase project first, then
  mirrored into `supabase/migrations/` as a file. The repo file is a record,
  not the source of truth. Lovable Cloud does not auto-apply repo migrations.
- SSR pages are CDN-cached for six hours. Loader output must be identical for
  every visitor. Personal state renders client-side after mount.
- Prefer the existing components: `ScrollRail`, `MediaCard`, `ScoreBadge`.
  A new component that duplicates one of these is a bug.
- Attribution to TMDB and OMDb is a license requirement, not a design choice.
