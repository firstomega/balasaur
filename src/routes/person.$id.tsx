import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { PersonDetail } from "@/components/balasaur/PersonDetail";
import { personDetailQueryOptions } from "@/hooks/usePersonDetail";
import { TopBar } from "@/components/balasaur/TopBar";
import { buildMeta, canonicalLink, clampDescription, absoluteUrl, jsonLdScript } from "@/lib/seo";
import { personJsonLd } from "@/lib/jsonld";

export const Route = createFileRoute("/person/$id")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(personDetailQueryOptions(params.id)),
  head: ({ loaderData, params }) => {
    const d = loaderData;
    const url = absoluteUrl(`/person/${params.id}`);
    const title = d ? `${d.name} — Balasaur` : "Balasaur";
    const description = d
      ? clampDescription(d.biography || `${d.name}'s movies and TV on Balasaur.`)
      : "Person details on Balasaur.";
    return {
      meta: buildMeta({ title, description, url, image: d?.profileUrl, type: "profile" }),
      links: [canonicalLink(url)],
      ...(d ? { scripts: [jsonLdScript(personJsonLd(d, url))] } : {}),
    };
  },
  component: PersonPage,
  errorComponent: PersonError,
  notFoundComponent: PersonNotFound,
});

function PersonPage() {
  const { id } = Route.useParams();
  return <PersonDetail id={id} />;
}

function PersonError({ reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-xl font-semibold text-text-bright">Couldn't load this person</h1>
        <p className="mt-2 text-sm text-text-muted">
          We hit a snag fetching their work. Try again or head back to the grid.
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

function PersonNotFound() {
  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-xl font-semibold text-text-bright">Couldn't find this person</h1>
        <p className="mt-2 text-sm text-text-muted">
          They may have been removed or the link is wrong.
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
