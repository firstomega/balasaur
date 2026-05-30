import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { TopBar } from "@/components/balasaur/TopBar";
import { MediaGrid } from "@/components/balasaur/MediaGrid";
import { useUserStatus } from "@/hooks/useUserStatus";
import { useAuth } from "@/hooks/useAuth";
import { AuthDialog } from "@/components/balasaur/AuthDialog";
import type { MediaItem, MediaType } from "@/types/media";

export const Route = createFileRoute("/lists")({
  head: () => ({
    meta: [{ title: "My lists · Balasaur" }],
  }),
  component: ListsPage,
});

type Bucket = "favorites" | "history" | "watchlist";

const BUCKET_ORDER: Bucket[] = ["favorites", "watchlist", "history"];

const BUCKET_LABEL: Record<Bucket, string> = {
  favorites: "Favorites",
  watchlist: "Watchlist",
  history: "History",
};

const BUCKET_HINT: Record<Bucket, string> = {
  favorites: "Titles you liked",
  watchlist: "Saved to watch later",
  history: "Everything you've watched",
};

function snapToItem(
  id: string,
  snap: { mediaType?: string; title?: string; posterUrl?: string; year?: string },
): MediaItem {
  return {
    id,
    mediaType: (snap.mediaType as MediaType) ?? "movie",
    title: snap.title ?? "(untitled)",
    year: snap.year ?? "",
    overview: "",
    posterUrl: snap.posterUrl ?? "",
    ratings: {},
    genres: [],
    streaming: [],
    lengthLabel: "",
    people: [],
  };
}

/**
 * A record can land in MULTIPLE buckets: a "liked" title is both a Favorite
 * AND part of History (you liked it, so you watched it). "skipped" files nowhere.
 */
function bucketsFor(rec: { status: string; sentiment?: string; intent?: string }): Bucket[] {
  if (rec.status === "seen") {
    return rec.sentiment === "liked" ? ["favorites", "history"] : ["history"];
  }
  if (rec.status === "unseen" && rec.intent === "want") return ["watchlist"];
  return []; // skipped / anything else
}

function ListsPage() {
  const { user, loading } = useAuth();
  const { statuses } = useUserStatus();
  const [authOpen, setAuthOpen] = useState(false);

  const grouped = useMemo(() => {
    const out: Record<Bucket, MediaItem[]> = {
      favorites: [],
      watchlist: [],
      history: [],
    };
    for (const [id, rec] of Object.entries(statuses)) {
      const item = snapToItem(id, rec.snapshot ?? {});
      for (const b of bucketsFor(rec)) out[b].push(item);
    }
    return out;
  }, [statuses]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <main className="mx-auto max-w-[1600px] px-4 py-6">
        <h1 className="mb-6 font-mono text-[14px] uppercase tracking-[0.18em] text-text-bright">
          My lists
        </h1>

        {!loading && !user ? (
          <div className="rounded-[5px] border border-border bg-panel p-8 text-center">
            <p className="font-mono text-[12px] uppercase tracking-wider text-text-bright">
              Sign in to see your saved choices
            </p>
            <p className="mt-2 font-mono text-[10.5px] text-text-muted">
              Your library travels with your account.
            </p>
            <button
              type="button"
              onClick={() => setAuthOpen(true)}
              className="mt-4 cursor-pointer rounded-[5px] bg-primary px-4 py-2 font-mono text-[12px] uppercase tracking-wider text-primary-foreground hover:bg-primary/90"
            >
              Sign in
            </button>
            <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
          </div>
        ) : (
          <div className="space-y-10">
            {BUCKET_ORDER.map((b) => (
              <section key={b}>
                <div className="mb-3 flex items-baseline justify-between border-b border-border pb-1">
                  <div className="flex items-baseline gap-2">
                    <h2 className="font-mono text-[12px] uppercase tracking-wider text-text-bright">
                      {BUCKET_LABEL[b]}
                    </h2>
                    <span className="font-mono text-[9.5px] uppercase tracking-wider text-text-dim">
                      {BUCKET_HINT[b]}
                    </span>
                  </div>
                  <span className="font-mono text-[10.5px] text-text-muted">
                    {grouped[b].length}
                  </span>
                </div>
                {grouped[b].length === 0 ? (
                  <p className="font-mono text-[10.5px] text-text-dim">Nothing here yet.</p>
                ) : (
                  <MediaGrid items={grouped[b]} />
                )}
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
