import { Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";
import { MediaGrid } from "@/components/balasaur/MediaGrid";
import { MediaGridSkeleton } from "@/components/balasaur/MediaCardSkeleton";
import { mediaItemsQueryOptions, useMediaItems } from "@/hooks/useMediaItems";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Balasaur — cross-media discovery" },
      {
        name: "description",
        content:
          "A dense, professional discovery database for movies, TV, books, and podcasts.",
      },
      { property: "og:title", content: "Balasaur — cross-media discovery" },
      {
        property: "og:description",
        content:
          "A dense, professional discovery database for movies, TV, books, and podcasts.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(mediaItemsQueryOptions),
  errorComponent: HomeError,
  component: HomePage,
});

function HomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <main className="mx-auto max-w-[1600px] px-4 py-5">
        <div className="mb-4 flex items-baseline justify-between border-b border-border pb-2">
          <h1 className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
            Firehose · trending this week
          </h1>
          <span className="font-mono text-[10px] text-text-dim">
            movies + tv
          </span>
        </div>
        <Suspense fallback={<MediaGridSkeleton />}>
          <Grid />
        </Suspense>
      </main>
    </div>
  );
}

function Grid() {
  const { data } = useMediaItems();
  return <MediaGrid items={data} />;
}

function HomeError({ error }: { error: Error }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <main className="mx-auto max-w-[1600px] px-4 py-10">
        <div className="rounded-[5px] border border-border bg-panel p-6">
          <h2 className="font-mono text-[12px] uppercase tracking-wider text-text-bright">
            Couldn't load the firehose
          </h2>
          <p className="mt-2 font-mono text-[11px] text-text-muted">
            {error.message}
          </p>
        </div>
      </main>
    </div>
  );
}
