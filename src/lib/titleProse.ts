// Per-title data-prose, the same house pattern as collectionsProse.ts:
// deterministic sentences composed from what this database actually holds,
// never an LLM and never a restatement of the TMDB synopsis.
//
// Two rules decide what is allowed in here.
//
// 1. Only this database can make the claim. A competitor mirroring the same
//    API could not write the sentence. This is what carries a large catalog
//    past an ad network's originality review.
//
// 2. The claim answers a question a viewer actually has. True, reconstructable
//    and irrelevant is still noise, and it is the failure mode a data-driven
//    writer falls into first, because the numbers that are easiest to compute
//    are the ones nobody asked for. Three sentences have been cut on exactly
//    that ground:
//
//    "Above the catalog median of 62" measured against a scale that exists
//    only inside the database.
//
//    "Scores higher than 96% of the 2,035 2020s action movies in this
//    catalog" did the same with a smaller denominator. A shelf of 2,035 is
//    still a set nobody holds in their head, and the sentence was really about
//    how the catalog is built.
//
//    "Audiences rate it 14 points higher than critics do" manufactured a
//    tension nobody came to the page to read about. A viewer weighs the
//    numbers themselves, which sit right above the paragraph.
//
//    What is left compares inside sets a person already holds: a series, the
//    sources themselves, the length of an evening.
//
// Someone landing here from a search is asking, in this order: is it any good,
// how does it sit next to the thing I already know, is it worth my evening,
// and where do I watch it. The sentences are ordered to answer that, and a
// sentence is dropped whenever its fact is not notable. A short honest
// paragraph beats a padded one, so the paragraph is also hard-capped: past a
// certain length a reader stops reading and starts skimming for the streaming
// line.

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
  /** Franchise standing by score (title_context). */
  franchise?: { size: number; rank: number };
}

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

/** A ten-point score the way IMDb and TMDB print it: always one decimal, so a
 *  6 reads "6.0" here exactly as it does on the source's own page. */
export function tenPoint(n: number): string {
  return n.toFixed(1);
}

/** Put every source on the same 0 to 100 scale so they can be compared. */
export function normalizedSources(r: TitleProseInput["ratings"]): {
  label: string;
  shown: string;
  pct: number;
}[] {
  const out: { label: string; shown: string; pct: number }[] = [];
  if (typeof r.imdb === "number") {
    out.push({ label: "IMDb", shown: `${tenPoint(r.imdb)}/10`, pct: Math.round(r.imdb * 10) });
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
    out.push({ label: "TMDB", shown: `${tenPoint(r.tmdb)}/10`, pct: Math.round(r.tmdb * 10) });
  }
  return out;
}

/** Do the sources land together? Said only when they genuinely do: three or
 *  more of them inside a narrow band, which answers "is it good" more firmly
 *  than any one of them can. When they do not, the page says nothing and the
 *  numbers above the paragraph speak for themselves. */
export function consensusNote(r: TitleProseInput["ratings"], voteCount?: number): string | null {
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

/** Where the title sits in its own series, by score. A series is a set the
 *  viewer already holds, which is what makes the rank mean something. */
export function franchiseNote(f: TitleProseInput["franchise"]): string | null {
  if (!f || f.size < 2) return null;
  return f.rank === 1
    ? `The highest scoring of the ${f.size} titles in its series.`
    : `Number ${f.rank} of ${f.size} in its series by score.`;
}

/** "2h 28m", or "48m" under an hour. */
export function runtimeLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

/** True when the series has stopped making episodes. */
export function seriesFinished(status?: string): boolean {
  return status === "Ended" || status === "Canceled";
}

/** "Netflix", "Netflix and Hulu", "Netflix, Hulu, and Max". */
export function serviceList(services: string[]): string | null {
  const svc = services.filter(Boolean);
  if (svc.length === 0) return null;
  if (svc.length === 1) return svc[0];
  if (svc.length === 2) return `${svc[0]} and ${svc[1]}`;
  return `${svc.slice(0, -1).join(", ")}, and ${svc[svc.length - 1]}`;
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

  const consensus = consensusNote(d.ratings, d.voteCount);
  if (consensus) parts.push(consensus);

  // 2. How it sits next to the thing you already know.
  const franchise = franchiseNote(d.franchise);
  if (franchise) parts.push(franchise);

  // 3. Is it worth the evening. Seasons for TV, runtime for film.
  if (d.mediaType === "tv" && typeof d.numberOfSeasons === "number" && d.numberOfSeasons > 0) {
    const eps =
      typeof d.numberOfEpisodes === "number" && d.numberOfEpisodes > 0
        ? ` across ${d.numberOfEpisodes} episodes`
        : "";
    const seasonWord = d.numberOfSeasons === 1 ? "season" : "seasons";
    parts.push(
      seriesFinished(d.completionStatus)
        ? `The series ran ${d.numberOfSeasons} ${seasonWord}${eps} and has finished, so there is no cliffhanger risk.`
        : `${d.numberOfSeasons} ${seasonWord}${eps} so far, still running.`,
    );
  } else if (d.mediaType === "movie" && typeof d.runtime === "number" && d.runtime > 0) {
    const len = runtimeLabel(d.runtime);
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

  // 4. Where you can actually watch it. The reason most visitors arrived, so
  //    it survives the length cap even when everything above it does not.
  const services = serviceList(d.streaming ?? []);
  const watch = services ? `Streaming on ${services}.` : null;

  const kept = parts.slice(0, watch ? MAX_SENTENCES - 1 : MAX_SENTENCES);
  if (watch) kept.push(watch);
  return kept.join(" ");
}
