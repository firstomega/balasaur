// Central SEO helpers — canonical origin, meta-tag and JSON-LD builders.
//
// Origin comes from VITE_SITE_URL (public, build-time inlined). Falls back to
// the production custom domain so canonical/sitemap/robots are always absolute
// even if the env var is missing in a given environment.

import { createIsomorphicFn } from "@tanstack/react-start";
import { titleProse, type TitleProseInput } from "./titleProse";
import { personProse } from "./personProse";

const RAW_ORIGIN = (import.meta.env.VITE_SITE_URL as string | undefined) ?? "https://balasaur.com";

/** Canonical origin with no trailing slash, e.g. "https://balasaur.com". */
export const SITE_ORIGIN = RAW_ORIGIN.replace(/\/+$/, "");

export const SITE_NAME = "Balasaur";
export const SITE_TAGLINE = "Your personal entertainment database";
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

/** Intent-tuned title/description for movie & TV detail pages: front-load what
 *  searchers type ("watch X", "X streaming") plus the score. */
// A title tag has roughly 60 characters of display width in Google's results
// before it is truncated, and what survives the cut has to carry the words a
// person types. Segments are therefore dropped from the least valuable end:
//
//   title and year > the rating > where to watch > the brand
//
// The brand goes last on purpose. Balasaur has not been announced, so nobody
// searches for it; a brand suffix on a site nobody knows is spent width. It
// stays whenever it fits, because it costs nothing then.
const TITLE_BUDGET = 60;
const BRAND_SUFFIX = ` | ${SITE_NAME}`;

/** Keep as many optional tails as the budget allows, then add the brand only
 *  if it still fits. Written this way round on purpose: an earlier version
 *  reserved room for the brand first, which dropped "rating 89/100" from
 *  "Little Amélie or the Character of Rain" to make space for a brand nobody
 *  is searching for. */
export function composeTitle(head: string, optional: string[]): string {
  for (let take = optional.length; take >= 0; take--) {
    const body = head + optional.slice(0, take).join("");
    if (body.length > TITLE_BUDGET) continue;
    return body.length + BRAND_SUFFIX.length <= TITLE_BUDGET ? body + BRAND_SUFFIX : body;
  }
  return head;
}

/**
 * Title tag and meta description for a movie or TV detail page.
 *
 * The description used to open with the score and then paste TMDB's synopsis.
 * That synopsis is on every site that mirrors the same API, so it was the one
 * piece of text here guaranteed not to be ours. It is replaced by the page's
 * own data-prose, which no competitor holds, and only falls back to the
 * synopsis when there is not enough data to say anything at all.
 */
export function detailMeta(d: TitleProseInput & { overview?: string }): {
  title: string;
  description: string;
} {
  const year = d.year ? ` (${d.year})` : "";
  const score = d.ratings?.balasaur;
  const hasStreaming = (d.streaming ?? []).length > 0;

  const optional: string[] = [];
  if (typeof score === "number") optional.push(` rating ${score}/100`);
  if (hasStreaming) optional.push(optional.length ? `, where to watch` : ` where to watch`);

  const prose = titleProse(d);
  const fallback =
    (typeof score === "number" ? `Balasaur Score ${score}/100. ` : "") + (d.overview ?? "");

  return {
    title: composeTitle(`${d.title}${year}`, optional),
    description: clampDescription(prose || fallback, 160),
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
