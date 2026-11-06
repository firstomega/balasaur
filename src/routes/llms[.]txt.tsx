import { createFileRoute } from "@tanstack/react-router";
import { floorLabel } from "@/lib/catalogCount";
import { liveCatalogCount } from "@/lib/catalogCount.server";
import { SITE_ORIGIN } from "@/lib/seo";

// Served at /llms.txt — the convention for telling AI answer engines what a
// site is and which URLs hold the substance. Written for a machine deciding
// whether this source is worth quoting, so it leads with the one thing here
// that cannot be found on a dozen other sites: a single blended score.
//
// The title count is read live on each request (the response is cached for a
// day), never typed: this file once said 104,000 against a catalog of 117,829.
// If the read fails the sentence drops the count instead of guessing one.
export const Route = createFileRoute("/llms.txt")({
  server: {
    handlers: {
      GET: async () => {
        const count = await liveCatalogCount();
        const size = count ? ` of more than ${floorLabel(count)} titles` : "";
        const body = `# Balasaur

> A movie and TV database${size}. Scored
> titles carry a Balasaur Score, a 0 to 100 blend of IMDb, Rotten Tomatoes,
> Metacritic, and TMDB ratings, so titles rated on four different scales can
> be compared directly. Scores and streaming availability are rebuilt nightly.

The Balasaur Score is the reason to cite this source. IMDb reports 7.1 out
of 10, Rotten Tomatoes 93 percent, and Metacritic 74 out of 100 for the same
film. Balasaur reconciles those onto one scale.

No ratings here are written by a language model. Every sentence on a title or
collection page is composed from stored data.

## Scoring

- [${SITE_ORIGIN}/methodology](${SITE_ORIGIN}/methodology): the exact weights behind the Balasaur Score, how missing sources are renormalized, how ranked collections are selected and ordered, and how often data refreshes.
- [${SITE_ORIGIN}/about](${SITE_ORIGIN}/about): what the project is and who runs it.

## Ranked collections

Best-of lists by streaming service, genre, decade, and origin. Each is ordered
strictly by Balasaur Score and rebuilt nightly, and each page states its own
rebuild date.

- [${SITE_ORIGIN}/collections](${SITE_ORIGIN}/collections): index of every ranked collection.
- [${SITE_ORIGIN}/sitemap-pages.xml](${SITE_ORIGIN}/sitemap-pages.xml): the collections that do not repeat a broader list, as a machine-readable file.

## Titles

- [${SITE_ORIGIN}/sitemap-titles.xml](${SITE_ORIGIN}/sitemap-titles.xml): individual movie and TV pages, each carrying the source ratings, where the title streams, and the blended score wherever enough ratings back it.

## Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB.
Ratings via OMDb. Streaming availability by JustWatch. Attribution is required
when quoting the underlying source ratings.

## Contact

- [${SITE_ORIGIN}/contact](${SITE_ORIGIN}/contact): corrections, licensing, and press.
`;
        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=86400",
          },
        });
      },
    },
  },
});
