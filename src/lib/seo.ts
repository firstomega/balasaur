// Central SEO helpers — canonical origin, meta-tag and JSON-LD builders.
//
// Origin comes from VITE_SITE_URL (public, build-time inlined). Falls back to
// the production custom domain so canonical/sitemap/robots are always absolute
// even if the env var is missing in a given environment.

import { createIsomorphicFn } from "@tanstack/react-start";
import {
  consensusNote,
  franchiseNote,
  normalizedSources,
  runtimeLabel,
  seriesFinished,
  serviceList,
  tenPoint,
  type TitleProseInput,
} from "./titleProse";
import { personProse } from "./personProse";
import { trustedScore } from "./trust";

const RAW_ORIGIN = (import.meta.env.VITE_SITE_URL as string | undefined) ?? "https://balasaur.com";

/** Canonical origin with no trailing slash, e.g. "https://balasaur.com". */
export const SITE_ORIGIN = RAW_ORIGIN.replace(/\/+$/, "");

export const SITE_NAME = "Balasaur";
// One tagline, used by the footer, the signed-out hero, the share card and the
// default meta description. Four different ones shipped at once, and the one
// that carried a claim only this catalog can make was on the about page, the
// page with the least traffic. "Your personal entertainment database" was the
// default description of the whole catalog and is a sentence any of a dozen
// competitors could print, which is the thin-derivative signal that gets a
// database site demoted.
export const SITE_TAGLINE = "A movie and TV database built around one number";
// The second beat, wherever the tagline gets a line of backing: what the number
// is and how current it is. Lives here rather than in each surface so the hero
// and the share card cannot drift apart. scripts/brand-assets.ts reads both of
// these straight out of this file when it renders public/og-default.png.
export const SITE_PROOF = "Every title carries a Balasaur Score from 0 to 100, refreshed nightly.";
// Fallback share image: the branded card in public/og-default.png. Pages with
// real art (posters, backdrops) pass their own image; this covers the rest.
export const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/og-default.png`;

/** Build an absolute URL from a route path (e.g. "/movie/27205"). */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_ORIGIN}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** Truncate to a clean meta-description length.
 *
 *  Whole sentences first: the source text here is composed prose, and cutting
 *  it mid-clause produced descriptions ending "across…" and "in…", which spend
 *  the most valuable line in a search result on half a fact. Falls back to a
 *  word-boundary cut only when even the first sentence is too long. */
export function clampDescription(text: string | undefined, max = 160): string {
  if (!text) return `${SITE_TAGLINE}. Discover, track, and rate movies and TV.`;
  const t = text.trim();
  if (t.length <= max) return t;

  // Split only at a terminator followed by whitespace and the start of a new
  // sentence. A naive /[.!?]/ split cuts "IMDb 5.8/10" in half, which is how
  // an earlier version produced descriptions beginning "8/10, Rotten Tomatoes".
  // The digit in the lookahead matters too: "5 seasons across 62 episodes"
  // is a real sentence opening here.
  const sentences = t.split(/(?<=[.!?])\s+(?=[A-Z0-9])/);
  let out = "";
  let stoppedAt = -1;
  for (let i = 0; i < sentences.length; i++) {
    const next = out ? `${out} ${sentences[i]}` : sentences[i];
    if (next.length > max) {
      stoppedAt = i;
      break;
    }
    out = next;
  }
  if (out.length > 0) {
    // Whole sentences can leave a lot of the snippet unused: "A Balasaur Score
    // of 81 out of 100, drawn from IMDb 7.5/10, Rotten Tomatoes 97%, Metacritic
    // 84/100." spends 98 of 160 characters and the next sentence does not fit.
    // Sixty empty characters in the one line a searcher reads is worth more
    // than a clean full stop, so a wide gap gets filled with the start of the
    // next sentence, cut on a word boundary.
    const room = max - out.length - 1;
    if (stoppedAt >= 0 && room >= 40) {
      const cut = sentences[stoppedAt].slice(0, room - 1);
      const lastSpace = cut.lastIndexOf(" ");
      if (lastSpace > 20) return `${out} ${cut.slice(0, lastSpace).trimEnd()}…`;
    }
    return out;
  }

  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 60 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

export interface MetaTag {
  title?: string;
  name?: string;
  property?: string;
  content?: string;
}

/**
 * Standard meta block: title, description, canonical (as og:url + a link is
 * added separately), Open Graph, and Twitter card. Pass an absolute `url` and
 * (optionally) an absolute `image`.
 */
export function buildMeta(opts: {
  title: string;
  description: string;
  url: string;
  image?: string;
  type?: string;
}): MetaTag[] {
  const { title, description, url } = opts;
  const image = opts.image || DEFAULT_OG_IMAGE;
  const type = opts.type || "website";
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: type },
    { property: "og:url", content: url },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:image", content: image },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
  ];
}

/** Canonical <link>, for the `links` array of a route head(). */
export function canonicalLink(url: string) {
  return { rel: "canonical", href: url };
}

/**
 * CDN-cache the current SSR response. Call from a route LOADER (server pass
 * only — the guard makes it a no-op during client-side navigation). Detail
 * pages are user-agnostic HTML (auth state renders client-side after
 * hydration), so shared caching is safe; this is the main lever on the
 * 4.6s average Googlebot response time that collapsed the crawl budget.
 * max-age=0 keeps browsers revalidating; s-maxage lets the CDN serve for
 * `seconds`; stale-while-revalidate keeps responses instant during refresh.
 */
const setSsrCacheControl = createIsomorphicFn()
  .client((_value: string) => {})
  .server(async (value: string) => {
    try {
      const { setResponseHeader } = await import("@tanstack/react-start/server");
      setResponseHeader("Cache-Control", value);
    } catch {
      // Outside a request context (prerender/edge quirk) — caching is best-effort.
    }
  });

export async function cacheSsrResponse(seconds = 21600, swrSeconds = 86400): Promise<void> {
  // swrSeconds matters when the content flips on a schedule: a hardcoded
  // 24-hour stale window let the CDN serve yesterday's daily puzzle past
  // midnight, which is exactly what the page's short TTL tried to prevent.
  await setSsrCacheControl(
    `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${swrSeconds}`,
  );
}

/** Meta tag asking crawlers to skip this page (tiered indexation). */
export function noindexMeta(): MetaTag {
  return { name: "robots", content: "noindex, follow" };
}

// The index gate lives in indexability.ts so it stays pure and testable, and
// so media.server.ts can share the same rule without importing this module.
export { MIN_SUBSTANCE_FACTS, hasSubstance, isIndexableDetail } from "./indexability";

// A title tag has roughly 60 characters of display width in Google's results
// before it is truncated, and what survives the cut has to carry the words a
// person types. Segments are therefore dropped from the least valuable end:
//
//   title and year > IMDb > Rotten Tomatoes > the brand
//
// The brand goes last on purpose. Balasaur has not been announced, so nobody
// searches for it; a brand suffix on a site nobody knows is spent width. It
// stays whenever it fits, because it costs nothing then.
const TITLE_BUDGET = 60;
const BRAND_SUFFIX = ` | ${SITE_NAME}`;

/** Keep as many optional tails as the budget allows, then add the brand only
 *  if it still fits. Written this way round on purpose: an earlier version
 *  reserved room for the brand first, which dropped the rating from "Little
 *  Amélie or the Character of Rain" to make space for a brand nobody is
 *  searching for. */
export function composeTitle(head: string, optional: string[]): string {
  for (let take = optional.length; take >= 0; take--) {
    const body = head + optional.slice(0, take).join("");
    if (body.length > TITLE_BUDGET) continue;
    return body.length + BRAND_SUFFIX.length <= TITLE_BUDGET ? body + BRAND_SUFFIX : body;
  }
  return head;
}

/** The scores people type next to a title, by the names they type: "inception
 *  imdb", "inception rotten tomatoes". At most two, so the tag stays inside
 *  the display budget for ordinary titles. Metacritic stands in only when one
 *  of the first two is missing. TMDB never appears: nobody searches for it. */
export function familiarScores(r: TitleProseInput["ratings"]): string[] {
  const out: string[] = [];
  if (typeof r.imdb === "number") out.push(`IMDb ${tenPoint(r.imdb)}`);
  if (typeof r.rottenTomatoes === "number") out.push(`Rotten Tomatoes ${r.rottenTomatoes}%`);
  if (typeof r.metacritic === "number") out.push(`Metacritic ${r.metacritic}`);
  return out.slice(0, 2);
}

/** A head longer than this would leave no room in the description for the
 *  facts it exists to carry, so the lead sentence says "It" instead. */
const DESCRIPTION_HEAD_MAX = 60;

type DetailMetaInput = TitleProseInput & {
  overview?: string;
  /** Detail payloads nest franchise standing here; the component unwraps it the
   *  same way. Read both so a payload of either shape keeps the sentence. */
  context?: { franchise?: TitleProseInput["franchise"] };
  /** Detail payloads carry TMDB's series status here, not as completionStatus. */
  facts?: { status?: string };
};

/** How long it takes to watch, as the opening clause of the description. */
function lengthClause(d: DetailMetaInput): string | null {
  if (d.mediaType === "tv" && typeof d.numberOfSeasons === "number" && d.numberOfSeasons > 0) {
    const n = d.numberOfSeasons;
    const e = typeof d.numberOfEpisodes === "number" ? d.numberOfEpisodes : 0;
    const status = d.completionStatus ?? d.facts?.status;
    const seasons = `${n} season${n === 1 ? "" : "s"}`;
    const episodes = `${e} episode${e === 1 ? "" : "s"}`;
    if (seriesFinished(status)) {
      if (!e) return `ran ${seasons}`;
      return n === 1 ? `ran 1 season of ${episodes}` : `ran ${seasons} and ${episodes}`;
    }
    const body = e ? `${seasons} and ${episodes}` : seasons;
    return status ? `has ${body} so far` : `has ${body}`;
  }
  if (d.mediaType === "movie" && typeof d.runtime === "number" && d.runtime > 0) {
    return `runs ${runtimeLabel(d.runtime)}`;
  }
  return null;
}

/**
 * The meta description: the facts a person weighs before clicking, in the
 * order they weigh them. How long it is, what the familiar scores say, where
 * it streams, then the Balasaur Score that blends them.
 *
 * Every description used to open "A Balasaur Score of N out of 100, drawn
 * from", so tens of thousands of snippets shared their first eight words and
 * the part that differed was the part Google cuts. Opening on the title's own
 * name and length makes the first words different on every page.
 *
 * TMDB's synopsis is on every site that mirrors the same API, so it is used
 * only when there is no fact at all to state.
 *
 * Not exported: `score` must already have passed the trust rule, and
 * detailMeta is the one caller that guarantees it.
 */
function detailDescription(d: DetailMetaInput, score: number | undefined): string {
  const year = d.year ? ` (${d.year})` : "";
  const head = `${d.title}${year}`;
  const named = head.length <= DESCRIPTION_HEAD_MAX;
  const subject = named ? head : "It";

  const parts: string[] = [];
  const length = lengthClause(d);
  if (length) parts.push(`${subject} ${length}.`);

  const sources = normalizedSources(d.ratings ?? {});
  if (sources.length > 0) {
    const list = sources.map((s) => `${s.label} ${s.shown}`).join(", ");
    parts.push(parts.length === 0 && named ? `${head}: ${list}.` : `${list}.`);
  }

  const services = serviceList(d.streaming ?? []);
  if (services) {
    parts.push(
      parts.length === 0 && named
        ? `${head} is streaming on ${services}.`
        : `Streaming on ${services}.`,
    );
  }

  // One source is the whole score, so stating the blend would only restate it.
  if (typeof score === "number" && sources.length >= 2) {
    parts.push(`Balasaur Score ${score} out of 100.`);
  }

  if (parts.length === 0) return clampDescription(d.overview || undefined, 160);

  // A series rank is a ranking by score: said only when the score is shown.
  const franchise =
    typeof score === "number" ? franchiseNote(d.franchise ?? d.context?.franchise) : null;
  if (franchise) parts.push(franchise);
  const consensus = consensusNote(d.ratings ?? {}, d.voteCount);
  if (consensus) parts.push(consensus);

  return clampDescription(parts.join(" "), 160);
}

/**
 * Title tag and meta description for a movie or TV detail page.
 *
 * The tag names the scores people search for by name, "Inception (2010):
 * IMDb 8.8, Rotten Tomatoes 86%", and falls back to fewer of them, then to
 * just the title and year, as sources go missing or the name runs long. It
 * used to say "rating 84/100, where to watch": a number on a scale nobody
 * searches for, and a phrase that promised a page section rather than a fact.
 */
export function detailMeta(d: DetailMetaInput): {
  title: string;
  description: string;
} {
  const year = d.year ? ` (${d.year})` : "";
  // Same rule the page uses. Detail payloads do not always carry the blended
  // score; the page computes it at render time, so the description does the
  // same. A score the page will not show is not put in the search result
  // either, and neither is a series rank built on it.
  const score = trustedScore({ ratings: d.ratings ?? {}, voteCount: d.voteCount });

  const optional = familiarScores(d.ratings ?? {}).map((s, i) => (i === 0 ? `: ${s}` : `, ${s}`));

  return {
    title: composeTitle(`${d.title}${year}`, optional),
    description: detailDescription(d, score),
  };
}

/** Title tag and meta description for a person page. Same trade as above: the
 *  TMDB biography is shared with every site on the internet, the catalog stats
 *  are not. */
export function personMeta(d: {
  name: string;
  biography?: string;
  knownForDepartment?: string;
  stats?: Parameters<typeof personProse>[1];
}): { title: string; description: string } {
  const titles = d.stats?.titles;
  const optional: string[] = [];
  if (typeof titles === "number" && titles >= 3) {
    optional.push(`: ${titles} movies and TV shows, ranked`);
  } else {
    optional.push(`: movies and TV shows`);
  }

  const prose = d.stats ? personProse(d.name, d.stats) : "";
  return {
    title: composeTitle(d.name, optional),
    description: clampDescription(
      prose || d.biography || `${d.name}'s movies and TV shows in the Balasaur catalog.`,
      160,
    ),
  };
}

/**
 * Wrap a JSON-LD object for the `scripts` array of a route head().
 * TanStack serializes `children` into a <script type="application/ld+json">.
 */
export function jsonLdScript(data: Record<string, unknown>) {
  return {
    type: "application/ld+json",
    children: JSON.stringify(data),
  };
}
