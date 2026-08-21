import { createFileRoute, Link, notFound, redirect, useRouter } from "@tanstack/react-router";
import { MediaDetail } from "@/components/balasaur/MediaDetail";
import { mediaDetailQueryOptions } from "@/hooks/useMediaDetail";
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
import { breadcrumbJsonLd, tvJsonLd } from "@/lib/jsonld";
import { mediaSlug, parseMediaId } from "@/lib/slug";

export const Route = createFileRoute("/tv/$id")({
  loader: async ({ context, params }) => {
    // Six-hour CDN cache on the SSR'd HTML — detail pages change at most daily.
    await cacheSsrResponse();
    const id = parseMediaId(params.id);
    // A segment with no numeric id can never resolve. Without this the server
    // function's validator throws and the route answers 500; Googlebot found
    // the literal "/tv/$id" and logged a server error. A bad URL is a 404.
    if (!/^\d+$/.test(id)) throw notFound();
    // A numeric id TMDB does not know threw straight out of the loader, and the
    // route answered 500. Google reads a 500 as "this site is unwell" and slows
    // its crawl of the whole domain, which is the exact resource this site is
    // short of. A missing title is a 404. Anything else, including a real TMDB
    // outage, still raises: turning an outage into 404s would invite Google to
    // drop pages that do exist.
    let data;
    try {
      data = await context.queryClient.ensureQueryData(mediaDetailQueryOptions("tv", id));
    } catch (e) {
      if (/\b404\b/.test(e instanceof Error ? e.message : String(e))) throw notFound();
      throw e;
    }
    if (!data) throw notFound();
    // Canonicalize: 301 bare-id or stale-slug URLs to "<id>-<title-slug>".
    if (data?.title) {
      const canonical = mediaSlug(id, data.title);
      if (canonical !== params.id) {
        throw redirect({ to: "/tv/$id", params: { id: canonical }, statusCode: 301 });
      }
    }
    return data;
  },
  head: ({ loaderData, params }) => {
    const d = loaderData;
    const url = absoluteUrl(`/tv/${mediaSlug(parseMediaId(params.id), d?.title)}`);
    const { title, description } = d
      ? detailMeta(d)
      : { title: "Balasaur", description: clampDescription(undefined) };
    const image = d?.backdropUrl || d?.posterUrl;
    return {
      meta: [
        ...buildMeta({ title, description, url, image, type: "video.tv_show" }),
        ...(d && !isIndexableDetail(d) ? [noindexMeta()] : []),
      ],
      links: [canonicalLink(url)],
      ...(d
        ? { scripts: [jsonLdScript(tvJsonLd(d, url)), jsonLdScript(breadcrumbJsonLd(d, url))] }
        : {}),
    };
  },
  component: TvPage,
  errorComponent: DetailError,
  notFoundComponent: DetailNotFound,
});

function TvPage() {
  const id = parseMediaId(Route.useParams().id);
  return <MediaDetail mediaType="tv" id={id} />;
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
