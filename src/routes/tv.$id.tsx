import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { MediaDetail } from "@/components/balasaur/MediaDetail";
import { mediaDetailQueryOptions } from "@/hooks/useMediaDetail";
import { TopBar } from "@/components/balasaur/TopBar";
import { buildMeta, canonicalLink, clampDescription, absoluteUrl, jsonLdScript } from "@/lib/seo";
import { tvJsonLd } from "@/lib/jsonld";

export const Route = createFileRoute("/tv/$id")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(mediaDetailQueryOptions("tv", params.id)),
  head: ({ loaderData, params }) => {
    const d = loaderData;
    const url = absoluteUrl(`/tv/${params.id}`);
    const title = d ? `${d.title}${d.year ? ` (${d.year})` : ""} — Balasaur` : "Balasaur";
    const description = d ? clampDescription(d.overview) : "TV details on Balasaur.";
    const image = d?.backdropUrl || d?.posterUrl;
    return {
      meta: buildMeta({ title, description, url, image, type: "video.tv_show" }),
      links: [canonicalLink(url)],
      ...(d ? { scripts: [jsonLdScript(tvJsonLd(d, url))] } : {}),
    };
  },
  component: TvPage,
  errorComponent: DetailError,
  notFoundComponent: DetailNotFound,
});

function TvPage() {
  const { id } = Route.useParams();
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
