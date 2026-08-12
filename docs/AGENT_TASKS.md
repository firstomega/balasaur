# Agent task queue

This file is the hand-off channel between the reviewing agent (Claude, senior)
and the implementing agent (Antigravity, junior). Protocol:

- Claude writes tasks here and merges them to main. Each task has a status:
  OPEN (ready to start), IN REVIEW (PR open, awaiting review), or DONE.
- Antigravity: pull main, execute the TOPMOST task marked OPEN, exactly as
  written. Work on the branch the task names. Open a draft PR against main
  when finished. Do not merge PRs; the repo owner or Claude merges.
- Review feedback arrives as comments on the PR. Address them on the same
  branch and push; do not open a new PR for fixes.
- House rules for every task, always in force:
  - Never touch anything under `supabase/` or `.github/` unless the task
    says to. Database changes are never in scope.
  - Never use an em-dash in any user-visible string. Use periods, commas,
    or colons.
  - Do not add npm dependencies.
  - Do not reformat files outside the task's scope (no repo-wide prettier
    runs; format only the files you changed).
  - `src/routeTree.gen.ts` is generated. Regenerate it by running
    `bun run dev` briefly after adding a route; never hand-edit it.
  - Loader output on SSR pages must stay identical for every visitor
    (pages are CDN-cached). Personal state renders client-side after mount.
  - Before the PR: `bunx prettier --write` on changed files, `bun test src`
    green, `bunx tsc --noEmit` green, `bun run build` succeeds.

---

## TASK-002 · OPEN · Fix pass on collections-depth branch

You previously pushed the branch `antigravity/collections-depth` (commit
2283fee). The features are approved; four fixes are required. Stay on that
branch, make ONLY these changes, then open the draft PR.

1. Restore `docs/BACKLOG.md` exactly to its state on main. Your formatter
   reflowed the numbered lists in the monetization section into run-on
   lines, and the file was out of scope. Run
   `git checkout origin/main -- docs/BACKLOG.md` and commit it.
2. Delete `inspect_db.js` from the repo root. It is a leftover debug script.
3. Rank numbers must survive the Hide-seen filter. In
   `src/routes/best.$slug.tsx` the grid maps over `displayItems` and derives
   the big rank numeral from the render index (`i + 1`), so hiding seen
   titles renumbers the list: the true #9 displays as #1. Attach the
   original position before filtering:
   `const ranked = items.map((item, idx) => ({ item, rank: idx + 1 }))`,
   filter `ranked`, and render `entry.rank` in the poster overlay. Keep
   `eager` tied to the first five rendered cards (render index), since that
   concerns what is above the fold, not rank.
4. Remove the "Section 1" through "Section 4" eyebrow chips from
   `src/routes/methodology.tsx`. Keep the h2 headings and body copy.

Verify: `git diff origin/main -- docs/BACKLOG.md` is empty, `inspect_db.js`
is gone, the standard gates pass, and with Hide seen toggled a card's rank
numeral matches its position in the full list.

PR title: "Collections depth: votes on cards, related collections, seen
progress, methodology page". Body: one short section per feature plus a
"Review fixes" section listing the four items above.

---

## TASK-001 · IN REVIEW · Collections depth (original brief)

Superseded by TASK-002, which carries the review feedback. The original
brief (vote counts on collection cards, related collections, seen progress,
/methodology page) was executed on `antigravity/collections-depth` and
reviewed on 2026-08-12.
