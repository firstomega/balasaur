import { Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  deckMediaOptions,
  useDeckMedia,
  useViewerCountry,
  viewerCountryOptions,
} from "@/hooks/useCatalog";
import { useAuth } from "@/hooks/useAuth";
import { boostBucketsForCountry } from "@/lib/localFirst";
import { ssrBudget } from "@/lib/ssrBudget";
import { MediaGridSkeleton } from "@/components/balasaur/MediaCardSkeleton";
import { LibraryDeck, LibraryHeader } from "@/components/balasaur/LibraryDeck";
import { SITE_ORIGIN, canonicalLink } from "@/lib/seo";

export const Route = createFileRoute("/watched")({
  head: () => ({
    meta: [
      { title: "Rate Titles | Balasaur" },
      {
        name: "description",
        content:
          "Swipe through movies and TV to build your library: like, mark watched, save for later, or skip.",
      },
      { property: "og:url", content: SITE_ORIGIN + "/watched" },
      // A personal rating tool has nothing to offer a search result.
      { name: "robots", content: "noindex,follow" },
    ],
    links: [canonicalLink(SITE_ORIGIN + "/watched")],
  }),
  loader: async ({ context }) => {
    // Lead the rate deck with the viewer's home-country hits — the titles they've most
    // likely seen — so building history feels fast and familiar (popularity + local).
    // ssrBudget: a hanging backend must never stop the document from streaming; the
    // client refetches whatever the prefetch didn't finish.
    const country =
      (await ssrBudget(context.queryClient.ensureQueryData(viewerCountryOptions()), 2000)) ?? "";
    const boost = boostBucketsForCountry(country).length > 0 ? country : "";
    await ssrBudget(context.queryClient.ensureQueryData(deckMediaOptions("US", boost)), 5000);
  },
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
  const ipCountry = useViewerCountry();
  const { user } = useAuth();
  const homeCountry = (user?.user_metadata?.region as string | undefined) || ipCountry || "";
  const boost = boostBucketsForCountry(homeCountry).length > 0 ? homeCountry : "";
  const { data } = useDeckMedia("US", boost);
  return <LibraryDeck items={data} />;
}
