import { createFileRoute, Link, notFound, redirect, useRouter } from "@tanstack/react-router";
import { MediaDetail } from "@/components/balasaur/MediaDetail";
import { appearsInQueryOptions, mediaDetailQueryOptions } from "@/hooks/useMediaDetail";
import { TopBar } from "@/components/balasaur/TopBar";
import {
  buildMeta,
  canonicalLink,
  clampDescription,
  absoluteUrl,
  jsonLdScript,
  cacheSsrResponse,
  detailMeta,
  isIndexableDetail,
  noindexMeta,
} from "@/lib/seo";
import { breadcrumbJsonLd, movieJsonLd } from "@/lib/jsonld";
import { mediaSlug, parseMediaId } from "@/lib/slug";
import { ssrBudget } from "@/lib/ssrBudget";

export const Route = createFileRoute("/movie/$id")({
  loader: async ({ context, params }) => {
    // Six-hour CDN cache on the SSR'd HTML — detail pages change at most daily.
    await cacheSsrResponse();
    const id = parseMediaId(params.id);
    // A segment with no numeric id can never resolve. Without this the server
    // function's validator throws and the route answers 500; Googlebot found
    // the literal "/movie/$id" and logged a server error. A bad URL is a 404.
    if (!/^\d+$/.test(id)) throw notFound();
    // A numeric id TMDB does not know threw straight out of the loader, and the
    // route answered 500. Google reads a 500 as "this site is unwell" and slows
    // its crawl of the whole domain, which is the exact resource this site is
    // short of. A missing title is a 404. Anything else, including a real TMDB
    // outage, still raises: turning an outage into 404s would invite Google to
    // drop pages that do exist.
    let data;
    try {
      data = await context.queryClient.ensureQueryData(mediaDetailQueryOptions("movie", id));
    } catch (e) {
      if (/\b404\b/.test(e instanceof Error ? e.message : String(e))) throw notFound();
      throw e;
    }
    if (!data) throw notFound();
    // Fill the "Appears in" shelf links before the page renders, so they exist
    // in the server-rendered HTML. As a client-only query they existed for
    // people and not for a crawler, which left the 635 /best/ pages reachable
    // from one hub and nowhere else: Inception ranks in ten shelves and its
    // HTML linked to none of them.
    //
    // This has to be awaited. A fire-and-forget prefetch returns before the
    // query resolves, the render finds nothing, and the links are missing from
    // the HTML exactly as before, which is how the first attempt at this fix
    // shipped and did nothing. The budget keeps a slow shelf lookup from
    // holding the page up: on a timeout the module simply renders client-side,
    // which is where it started.
    await ssrBudget(context.queryClient.prefetchQuery(appearsInQueryOptions(`movie-${id}`)), 800);
    // Canonicalize: 301 bare-id or stale-slug URLs to "<id>-<title-slug>".
    if (data?.title) {
      const canonical = mediaSlug(id, data.title);
      if (canonical !== params.id) {
        throw redirect({ to: "/movie/$id", params: { id: canonical }, statusCode: 301 });
      }
    }
    return data;
  },
  head: ({ loaderData, params }) => {
    const d = loaderData;
    const url = absoluteUrl(`/movie/${mediaSlug(parseMediaId(params.id), d?.title)}`);
    const { title, description } = d
      ? detailMeta(d)
      : { title: "Balasaur", description: clampDescription(undefined) };
    const image = d?.backdropUrl || d?.posterUrl;
    return {
      meta: [
        ...buildMeta({ title, description, url, image, type: "video.movie" }),
        // Thin pages stay out of the index until they can stand alone in a
        // search result (mirrors the sitemap gate).
        ...(d && !isIndexableDetail(d) ? [noindexMeta()] : []),
      ],
      links: [canonicalLink(url)],
      ...(d
        ? { scripts: [jsonLdScript(movieJsonLd(d, url)), jsonLdScript(breadcrumbJsonLd(d, url))] }
        : {}),
    };
  },
  component: MoviePage,
  errorComponent: DetailError,
  notFoundComponent: DetailNotFound,
});

function MoviePage() {
  const id = parseMediaId(Route.useParams().id);
  return <MediaDetail mediaType="movie" id={id} />;
}

function DetailError({ reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-xl font-semibold text-text-bright">Couldn't load this title</h1>
        <p className="mt-2 text-sm text-text-muted">
          We hit a snag fetching the details. Try again or head back to the grid.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-[5px] bg-primary px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-primary-foreground"
          >
            Try again
          </button>
          <Link
            to="/"
            className="rounded-[5px] border border-border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-text-bright"
          >
            Back to grid
          </Link>
        </div>
      </div>
    </div>
  );
}

function DetailNotFound() {
  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-xl font-semibold text-text-bright">Couldn't find this title</h1>
        <p className="mt-2 text-sm text-text-muted">
          It may have been removed or the link is wrong.
        </p>
        <Link
          to="/"
          className="mt-5 inline-block rounded-[5px] border border-border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-text-bright"
        >
          Back to grid
        </Link>
      </div>
    </div>
  );
}
