import { Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { deckMediaOptions, useDeckMedia } from "@/hooks/useCatalog";
import { MediaGridSkeleton } from "@/components/balasaur/MediaCardSkeleton";
import { LibraryDeck, LibraryHeader } from "@/components/balasaur/LibraryDeck";
import { SITE_ORIGIN, canonicalLink } from "@/lib/seo";

export const Route = createFileRoute("/watched")({
  head: () => ({
    meta: [
      { title: "Rate Titles — Balasaur" },
      {
        name: "description",
        content:
          "Swipe through movies and TV to build your library — like, mark watched, save for later, or skip.",
      },
      { property: "og:url", content: SITE_ORIGIN + "/watched" },
    ],
    links: [canonicalLink(SITE_ORIGIN + "/watched")],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(deckMediaOptions()),
  component: WatchedPage,
});

function WatchedPage() {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <LibraryHeader />
      <div className="min-h-0 flex-1">
        <Suspense
          fallback={
            <div className="p-6">
              <MediaGridSkeleton count={6} />
            </div>
          }
        >
          <Deck />
        </Suspense>
      </div>
    </div>
  );
}

function Deck() {
  const { data } = useDeckMedia();
  return <LibraryDeck items={data} />;
}
