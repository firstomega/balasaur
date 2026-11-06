import { SITE_DESCRIPTION } from "./seo";

// The home page's title and description: the two lines a searcher reads in a
// Google result before deciding to click. The title is a plain label. The
// description names the titles at the top of the home grid's "Top rated"
// sort, so every number in it can be checked on the page it links to: open
// the home page, sort by Top rated, and the first card is the leader.
//
// The previous title was a slogan ("Stop Scrolling, Start Watching") and the
// previous description narrated the filter rail. Neither said anything a
// competitor could not print.

export const HOME_TITLE = "Balasaur: Movie and TV Ratings in One Score";

/** The definition every result needs: what "94" is a score of. */
const BLEND = "Scores blend IMDb, Rotten Tomatoes, Metacritic and TMDB.";

/** Google shows about this many characters of a description. */
const MAX = 160;

export interface HomeLeader {
  title: string;
  /** The score the card's sticker shows. */
  score: number;
}

export interface HomeLeaders {
  /** The first movies on Top rated, in order, each with a shown score. */
  movies: HomeLeader[];
  /** The first shows on Top rated, in order, each with a shown score. */
  shows: HomeLeader[];
}

/** "The Godfather leads movies at 94, ahead of 12 Angry Men (93)." The
 *  runner-up is named only when its shown score is lower: "ahead of" a title
 *  with the same number is an order nobody can check. */
function leadSentence(list: HomeLeader[], noun: string, withRunnerUp: boolean): string | null {
  const [lead, next] = list;
  if (!lead) return null;
  if (withRunnerUp && next && next.score < lead.score) {
    return `${lead.title} leads ${noun} at ${lead.score}, ahead of ${next.title} (${next.score}).`;
  }
  return `${lead.title} leads ${noun} at ${lead.score}.`;
}

/**
 * The home description, longest version that fits first. Drops the show
 * leader, then the movie runner-up, before it ever drops the line that says
 * what the score is. With no leaders at all (the read failed or timed out)
 * it falls back to the site description, which carries the same definition.
 */
export function homeDescription(leaders: HomeLeaders | null | undefined): string {
  if (!leaders) return SITE_DESCRIPTION;
  const shows = leadSentence(leaders.shows, "shows", false);
  const candidates = [
    [leadSentence(leaders.movies, "movies", true), shows],
    [leadSentence(leaders.movies, "movies", true)],
    [leadSentence(leaders.movies, "movies", false)],
    [shows],
  ];
  for (const parts of candidates) {
    const facts = parts.filter((p): p is string => !!p);
    if (facts.length === 0) continue;
    const text = [...facts, BLEND].join(" ");
    if (text.length <= MAX) return text;
  }
  return SITE_DESCRIPTION;
}
