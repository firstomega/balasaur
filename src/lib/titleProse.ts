// Per-title data-prose, the same house pattern as collectionsProse.ts:
// deterministic sentences composed from what this database actually holds,
// never an LLM and never a restatement of the TMDB synopsis. Every sentence
// has to be a claim a competitor mirroring the same API could not make,
// which is what carries a 66,000-page catalog past an ad network's
// originality review.
//
// Sentences are omitted when the underlying fact is not notable. A short
// honest paragraph beats a padded one.

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

/** Catalog-wide typical Balasaur Score (mirrors rank.ts). */
const CATALOG_MEDIAN = 62;
/** Below this, sources are close enough that "they disagree" would be noise. */
const DIVERGENCE_POINTS = 20;

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)},000`;
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

export function titleProse(d: TitleProseInput): string {
  const parts: string[] = [];
  const sources = normalizedSources(d.ratings);
  const score = d.ratings.balasaur;

  // 1. The score and the sources behind it. Only we hold all four normalized.
  if (typeof score === "number" && sources.length > 0) {
    const list = sources.map((s) => `${s.label} ${s.shown}`).join(", ");
    parts.push(`A Balasaur Score of ${score} out of 100, drawn from ${list}.`);
  } else if (typeof score === "number") {
    parts.push(`A Balasaur Score of ${score} out of 100.`);
  }

  // 2. Where it sits against the catalog. Skipped inside the noise band.
  if (typeof score === "number") {
    const delta = score - CATALOG_MEDIAN;
    if (delta >= 15) {
      parts.push(`That puts it well above the catalog median of ${CATALOG_MEDIAN}.`);
    } else if (delta <= -15) {
      parts.push(`That sits well below the catalog median of ${CATALOG_MEDIAN}.`);
    }
  }

  // 3. The cohort claim: the strongest originality line available, printed
  //    only when the cohort is big enough for the percentile to mean something
  //    and the position is actually notable.
  if (d.cohort && d.cohort.size >= 50) {
    if (d.cohort.percentile >= 70) {
      parts.push(
        `Scores higher than ${d.cohort.percentile}% of the ${d.cohort.size.toLocaleString("en-US")} ${d.cohort.label} in this catalog.`,
      );
    } else if (d.cohort.percentile <= 30) {
      parts.push(
        `Most of the ${d.cohort.size.toLocaleString("en-US")} ${d.cohort.label} in this catalog score higher.`,
      );
    }
  }

  // 4. Franchise standing, when there is a series to stand in.
  if (d.franchise && d.franchise.size >= 2) {
    parts.push(
      d.franchise.rank === 1
        ? `The highest scoring of the ${d.franchise.size} titles in its series.`
        : `Number ${d.franchise.rank} of ${d.franchise.size} in its series by score.`,
    );
  }

  // 5. Do the sources agree? The most interesting thing we can say.
  const div = divergenceNote(d.ratings);
  if (div) parts.push(div);

  // 4. How much weight is behind the audience number.
  if (
    typeof d.voteCount === "number" &&
    d.voteCount >= 1000 &&
    typeof d.ratings.imdb === "number"
  ) {
    parts.push(`The audience score reflects ${compact(d.voteCount)} votes.`);
  }

  // 5. Shape of the thing: seasons for TV, runtime for film.
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
        : `${d.numberOfSeasons} ${seasonWord}${eps} so far.`,
    );
  } else if (d.mediaType === "movie" && typeof d.runtime === "number" && d.runtime > 0) {
    const h = Math.floor(d.runtime / 60);
    const m = d.runtime % 60;
    const len = h ? `${h}h ${m}m` : `${m}m`;
    if (d.runtime >= 150) parts.push(`It runs long at ${len}.`);
    else if (d.runtime <= 90) parts.push(`It runs a compact ${len}.`);
    else parts.push(`Running time is ${len}.`);
  }

  // 6. Awards, stated flatly.
  if (d.awardWinner) {
    parts.push(`It has won at least one major award.`);
  } else if (d.awardNominee) {
    parts.push(`It has been nominated for a major award.`);
  }

  // 7. Where you can actually watch it. The reason most visitors arrived.
  const svc = (d.streaming ?? []).filter(Boolean);
  if (svc.length === 1) {
    parts.push(`Streaming on ${svc[0]}.`);
  } else if (svc.length === 2) {
    parts.push(`Streaming on ${svc[0]} and ${svc[1]}.`);
  } else if (svc.length > 2) {
    parts.push(`Streaming on ${svc.slice(0, -1).join(", ")}, and ${svc[svc.length - 1]}.`);
  }

  return parts.join(" ");
}
