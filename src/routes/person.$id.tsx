import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { PersonDetail } from "@/components/balasaur/PersonDetail";
import { personDetailQueryOptions } from "@/hooks/usePersonDetail";
import {
  buildMeta,
  canonicalLink,
  personMeta,
  absoluteUrl,
  jsonLdScript,
  cacheSsrResponse,
  noindexMeta,
} from "@/lib/seo";
import { personJsonLd } from "@/lib/jsonld";

export const Route = createFileRoute("/person/$id")({
  loader: async ({ context, params }) => {
    // Six-hour CDN cache on the SSR'd HTML (person pages are user-agnostic).
    await cacheSsrResponse();
    // A segment that is not a person id can never resolve. Without this the
    // server function's validator throws and the route answers 500, the same
    // way /movie/$id did before its guard. A bad URL is a 404. The test
    // matches the validator in media.functions.ts, so every id that reaches
    // the fetch is one the fetch accepts.
    if (!/^[1-9]\d{0,9}$/.test(params.id)) throw notFound();
    // A numeric id TMDB does not know threw straight out of the loader, and
    // the route answered 500. Google reads a 500 as "this site is unwell" and
    // slows its crawl of the whole domain, which is the exact resource this
    // site is short of. A missing person is a 404. Anything else, including a
    // real TMDB outage, still raises: turning an outage into 404s would invite
    // Google to drop pages that do exist.
    try {
      return await context.queryClient.ensureQueryData(personDetailQueryOptions(params.id));
    } catch (e) {
      if (/\b404\b/.test(e instanceof Error ? e.message : String(e))) throw notFound();
      throw e;
    }
  },
  head: ({ loaderData, params }) => {
    const d = loaderData;
    const url = absoluteUrl(`/person/${params.id}`);
    const { title, description } = d
      ? personMeta(d)
      : { title: "Balasaur", description: "Person details on Balasaur." };
    // Half a million people are reachable through credits links, most with a
    // couple of rows to their name. Only a real filmography earns an index
    // slot; the rest stay crawlable with noindex, mirroring the title gate.
    //
    // Count titles this site carries, not TMDB credits. groups comes from
    // combined_credits with no catalog lookup, so someone with fifty credits
    // for titles the catalog does not hold cleared a gate meant to keep them
    // out, and the page it let through has nothing on it. stats.titles is the
    // person_stats count over the catalog, and 8 is the same threshold the
    // people sitemap applies to person_index, so the two gates now agree on
    // which people are worth an index slot. stats is absent below 3 titles,
    // which falls on the noindex side of the same test.
    const workCount = d?.stats?.titles ?? 0;
    return {
      meta: [
        ...buildMeta({ title, description, url, image: d?.profileUrl, type: "profile" }),
        ...(d && workCount < 8 ? [noindexMeta()] : []),
      ],
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
            className="rounded-[5px] bg-primary px-3 py-1.5 text-[14px] font-bold tracking-[-0.01em] text-primary-foreground"
          >
            Try again
          </button>
          <Link
            to="/"
            className="rounded-[5px] border border-border px-3 py-1.5 text-[14px] font-bold tracking-[-0.01em] text-text-bright"
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
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-xl font-semibold text-text-bright">Couldn't find this person</h1>
        <p className="mt-2 text-sm text-text-muted">
          They may have been removed or the link is wrong.
        </p>
        <Link
          to="/"
          className="mt-5 inline-block rounded-[5px] border border-border px-3 py-1.5 text-[14px] font-bold tracking-[-0.01em] text-text-bright"
        >
          Back to grid
        </Link>
      </div>
    </div>
  );
}
