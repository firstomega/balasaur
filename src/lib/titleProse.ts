// Per-title data-prose, the same house pattern as collectionsProse.ts:
// deterministic sentences composed from what this database actually holds,
// never an LLM and never a restatement of the TMDB synopsis.
//
// Two rules decide what is allowed in here.
//
// 1. Only this database can make the claim. A competitor mirroring the same
//    API could not write the sentence. This is what carries a 66,000-page
//    catalog past an ad network's originality review.
//
// 2. The claim answers a question a viewer actually has. True, reconstructable
//    and irrelevant is still noise, and it is the failure mode a data-driven
//    writer falls into first, because the numbers that are easiest to compute
//    are the ones nobody asked for. "Above the catalog median of 62" was in
//    here and is gone: nobody holds a 66,000-title median in their head, so
//    the sentence measured against a scale that exists only inside the
//    database. What replaced it compares inside sets a person already holds:
//    a series, a genre-and-decade shelf, the sources themselves.
//
// Someone landing here from a search is asking, in this order: is it any good,
// do the people who rate things agree about that, how does it sit next to the
// thing I already know, is it worth my evening, and where do I watch it. The
// sentences are ordered to answer that, and a sentence is dropped whenever its
// fact is not notable. A short honest paragraph beats a padded one, so the
// paragraph is also hard-capped: past a certain length a reader stops reading
// and starts skimming for the streaming line.

export interface TitleProseInput {
  mediaType: string;
  title: string;
  year?: string;
  genres?: string[];
  origins?: string[];
  streaming?: string[];
  runtime?: number;
  numberOfSeasons?: number;
  numberOfEpisodes?: number;
  completionStatus?: string;
  awardWinner?: boolean;
  awardNominee?: boolean;
  voteCount?: number;
  ratings: {
    balasaur?: number;
    imdb?: number;
    rottenTomatoes?: number;
    metacritic?: number;
    tmdb?: number;
  };
  /** Where the score sits inside its genre-and-decade cohort (title_context). */
  cohort?: { label: string; size: number; percentile: number };
  /** Franchise standing by score (title_context). */
  franchise?: { size: number; rank: number };
}

// The agreement sentence is the one claim no competitor can copy, so the
// bands are set from the actual spread across the catalog rather than by feel.
// Over the 610 recent releases: a 12 point critic/audience gap catches 130
// titles and an 8 point total spread catches 28, so the two together speak for
// roughly a quarter of them. Widening further starts calling ordinary noise a
// finding, which is worse than saying nothing. Ten points was tried and
// rejected: at 67, 62 and 57 the sources are not agreeing, they are merely
// not far apart.
/** Below this, sources are close enough that "they disagree" would be noise. */
const DIVERGENCE_POINTS = 12;
/** At or under this, the sources are close enough that agreement is the story. */
const CONSENSUS_POINTS = 8;
/** Sentences past this get cut. A wall of facts reads as filler, not depth. */
const MAX_SENTENCES = 5;

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  // Round to hundreds below 10k. Rounding 3,641 to "4,000" overstates by an
  // amount a reader can check against the IMDb page in one click.
  if (n >= 10_000) return `${Math.round(n / 1_000)},000`;
  if (n >= 1_000) return (Math.round(n / 100) * 100).toLocaleString("en-US");
  return String(n);
}

/** Put every source on the same 0 to 100 scale so they can be compared. */
export function normalizedSources(r: TitleProseInput["ratings"]): {
  label: string;
  shown: string;
  pct: number;
}[] {
  const out: { label: string; shown: string; pct: number }[] = [];
  if (typeof r.imdb === "number") {
    out.push({ label: "IMDb", shown: `${r.imdb}/10`, pct: Math.round(r.imdb * 10) });
  }
  if (typeof r.rottenTomatoes === "number") {
    out.push({
      label: "Rotten Tomatoes",
      shown: `${r.rottenTomatoes}%`,
      pct: Math.round(r.rottenTomatoes),
    });
  }
  if (typeof r.metacritic === "number") {
    out.push({ label: "Metacritic", shown: `${r.metacritic}/100`, pct: Math.round(r.metacritic) });
  }
  if (typeof r.tmdb === "number" && typeof r.imdb !== "number") {
    out.push({ label: "TMDB", shown: `${r.tmdb}/10`, pct: Math.round(r.tmdb * 10) });
  }
  return out;
}

/** The critic/audience split, when there is one worth naming. */
export function divergenceNote(r: TitleProseInput["ratings"]): string | null {
  const critic =
    typeof r.metacritic === "number"
      ? r.metacritic
      : typeof r.rottenTomatoes === "number"
        ? r.rottenTomatoes
        : null;
  const audience = typeof r.imdb === "number" ? r.imdb * 10 : null;
  if (critic === null || audience === null) return null;
  const gap = Math.round(audience - critic);
  if (Math.abs(gap) < DIVERGENCE_POINTS) return null;
  return gap > 0
    ? `Audiences rate it ${gap} points higher than critics do.`
    : `Critics rate it ${Math.abs(gap)} points higher than audiences do.`;
}

/** Do the sources agree, disagree, or is neither worth a sentence?
 *
 *  This is the one claim on the page that no competitor can copy, because
 *  nobody else holds all four numbers side by side. It answers "is it good"
 *  more honestly than any single score does, so it goes near the top. */
function consensusNote(r: TitleProseInput["ratings"], voteCount?: number): string | null {
  const split = divergenceNote(r);
  if (split) return split;

  const pcts = normalizedSources(r).map((s) => s.pct);
  if (pcts.length < 3) return null;
  const spread = Math.max(...pcts) - Math.min(...pcts);
  if (spread > CONSENSUS_POINTS) return null;

  // The vote count rides along here rather than as its own sentence: it is the
  // reason to believe the agreement, not a separate fact.
  const backing =
    typeof voteCount === "number" && voteCount >= 1000
      ? `, across ${compact(voteCount)} audience votes`
      : "";
  return `Every source lands within ${spread} point${spread === 1 ? "" : "s"} of the others${backing}.`;
}

export function titleProse(d: TitleProseInput): string {
  const parts: string[] = [];
  const sources = normalizedSources(d.ratings);
  const score = d.ratings.balasaur;

  // 1. Is it any good. The score, and the receipts behind it.
  if (typeof score === "number" && sources.length > 0) {
    const list = sources.map((s) => `${s.label} ${s.shown}`).join(", ");
    parts.push(`A Balasaur Score of ${score} out of 100, drawn from ${list}.`);
  } else if (typeof score === "number") {
    parts.push(`A Balasaur Score of ${score} out of 100.`);
  }

  // 2. Do the people who rate things agree about that. Only we can say.
  const consensus = consensusNote(d.ratings, d.voteCount);
  if (consensus) parts.push(consensus);

  // 3. How it sits next to the thing you already know. A series is the set a
  //    viewer holds most firmly, so it outranks the genre shelf.
  if (d.franchise && d.franchise.size >= 2) {
    parts.push(
      d.franchise.rank === 1
        ? `The highest scoring of the ${d.franchise.size} titles in its series.`
        : `Number ${d.franchise.rank} of ${d.franchise.size} in its series by score.`,
    );
  } else if (d.cohort && d.cohort.size >= 50 && sources.length >= 2) {
    // Two sources minimum. Ranking a title above 96% of a shelf on the strength
    // of one unvetted number is the kind of ordering a skeptic can break.
    const size = d.cohort.size.toLocaleString("en-US");
    if (d.cohort.percentile >= 70) {
      parts.push(
        `Scores higher than ${d.cohort.percentile}% of the ${size} ${d.cohort.label} in this catalog.`,
      );
    } else if (d.cohort.percentile <= 30) {
      parts.push(`Most of the ${size} ${d.cohort.label} in this catalog score higher.`);
    }
  }

  // 4. Is it worth the evening. Seasons for TV, runtime for film.
  if (d.mediaType === "tv" && typeof d.numberOfSeasons === "number" && d.numberOfSeasons > 0) {
    const eps =
      typeof d.numberOfEpisodes === "number" && d.numberOfEpisodes > 0
        ? ` across ${d.numberOfEpisodes} episodes`
        : "";
    const ended = d.completionStatus === "Ended" || d.completionStatus === "Canceled";
    const seasonWord = d.numberOfSeasons === 1 ? "season" : "seasons";
    parts.push(
      ended
        ? `The series ran ${d.numberOfSeasons} ${seasonWord}${eps} and has finished, so there is no cliffhanger risk.`
        : `${d.numberOfSeasons} ${seasonWord}${eps} so far, still running.`,
    );
  } else if (d.mediaType === "movie" && typeof d.runtime === "number" && d.runtime > 0) {
    const h = Math.floor(d.runtime / 60);
    const m = d.runtime % 60;
    const len = h ? `${h}h ${m}m` : `${m}m`;
    // Only the extremes answer "is this worth my evening". A 2h 8m film is
    // every film, and "Running time is 2h 8m" restates the runtime already
    // printed in the header two inches above.
    if (d.runtime >= 150) parts.push(`It runs long at ${len}.`);
    else if (d.runtime <= 90) parts.push(`It runs a compact ${len}.`);
  }

  // Awards used to sit here and are deliberately gone. `awardWinner` is true
  // whenever OMDb reports any win at all, including craft and festival prizes,
  // so "won at least one major award" was false on most of the 32% it fired
  // for: Jurassic World Rebirth and Alien: Earth both tripped it with an empty
  // list of named awards. The honest weak version ("won at least one award")
  // fires on a third of the catalog and separates nothing. The version worth
  // having names the Oscar, Emmy or BAFTA, and that needs `awards_won` carried
  // into the detail payload, which is its own change.

  // 5. Where you can actually watch it. The reason most visitors arrived, so
  //    it survives the length cap even when everything above it does not.
  const svc = (d.streaming ?? []).filter(Boolean);
  let watch: string | null = null;
  if (svc.length === 1) watch = `Streaming on ${svc[0]}.`;
  else if (svc.length === 2) watch = `Streaming on ${svc[0]} and ${svc[1]}.`;
  else if (svc.length > 2) {
    watch = `Streaming on ${svc.slice(0, -1).join(", ")}, and ${svc[svc.length - 1]}.`;
  }

  const kept = parts.slice(0, watch ? MAX_SENTENCES - 1 : MAX_SENTENCES);
  if (watch) kept.push(watch);
  return kept.join(" ");
}
