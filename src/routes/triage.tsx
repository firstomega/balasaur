import { Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { mediaItemsQueryOptions, useMediaItems } from "@/hooks/useMediaItems";
import { MediaGridSkeleton } from "@/components/balasaur/MediaCardSkeleton";
import { TriageDeck, TriageHeader } from "@/components/balasaur/TriageDeck";

export const Route = createFileRoute("/triage")({
  head: () => ({
    meta: [
      { title: "Triage — Balasaur" },
      {
        name: "description",
        content: "Swipe through trending media to mark what you've seen, loved, or want.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(mediaItemsQueryOptions),
  component: TriagePage,
});

function TriagePage() {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <TriageHeader />
      <div className="min-h-0 flex-1">
        <Suspense fallback={<div className="p-6"><MediaGridSkeleton count={6} /></div>}>
          <Deck />
        </Suspense>
      </div>
    </div>
  );
}

function Deck() {
  const { data } = useMediaItems();
  return <TriageDeck items={data} />;
}