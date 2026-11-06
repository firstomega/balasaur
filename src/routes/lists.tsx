import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MediaGrid } from "@/components/balasaur/MediaGrid";
import { MediaGridSkeleton } from "@/components/balasaur/MediaCardSkeleton";
import { useUserStatus } from "@/hooks/useUserStatus";
import { useAuth } from "@/hooks/useAuth";
import { AuthDialog } from "@/components/balasaur/AuthDialog";
import { EmptyState, EMPTY_ACTION_CLASS } from "@/components/balasaur/EmptyState";
import { isNotInterested, primaryOf, sentimentOf } from "@/lib/userStatus";
import type { MediaItem, MediaType } from "@/types/media";

export const Route = createFileRoute("/lists")({
  head: () => ({
    meta: [
      { title: "My lists · Balasaur" },
      { name: "description", content: "Your watchlist, favorites, and viewing history." },
      // Signed out this page is an empty shell, so it stays out of the index.
      { name: "robots", content: "noindex,follow" },
    ],
  }),
  component: ListsPage,
});

type Bucket = "watchlist" | "favorites" | "history" | "notInterested";

const BUCKET_ORDER: Bucket[] = ["watchlist", "favorites", "history", "notInterested"];

// The deck names these same four places when a card lands in one
// (LibraryDeck: "Favorites + History", "Watchlist"), so the names match it.
const BUCKET_LABEL: Record<Bucket, string> = {
  watchlist: "Watchlist",
  favorites: "Favorites",
  history: "History",
  notInterested: "Never",
};

// Empty states that point somewhere: the grid for saving, the deck for rating.
// `to` is a literal union of real route paths so a dead target fails typecheck
// instead of falling through to the /$handle catch-all at runtime.
const BUCKET_EMPTY: Record<
  Bucket,
  { line: string; hint: string; cta: string; to: "/" | "/watched" }
> = {
  watchlist: {
    line: "Nothing saved for later.",
    hint: "Hit Watchlist in the menu on any poster, or swipe left in the deck.",
    cta: "Browse the grid",
    to: "/",
  },
  favorites: {
    line: "Nothing marked Loved.",
    hint: "Swipe up in the deck on a title you loved, or hit Liked it on its page.",
    cta: "Rate titles",
    to: "/watched",
  },
  history: {
    line: "No watch history.",
    hint: "Swipe right in the deck on anything you have already seen.",
    cta: "Rate titles",
    to: "/watched",
  },
  notInterested: {
    line: "Nothing hidden.",
    hint: "Press X in the deck on a title you never want to see again. It does not come back.",
    cta: "Rate titles",
    to: "/watched",
  },
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
 * A record can land in MULTIPLE buckets: watched+liked is a Favorite AND part
 * of History. "skipped" files nowhere; "not interested" gets its own tab so
 * the hard-hidden set stays inspectable (and reversible from the title page).
 */
function bucketsFor(rec: Parameters<typeof primaryOf>[0]): Bucket[] {
  const primary = primaryOf(rec);
  if (primary === "watched") {
    return sentimentOf(rec) === "liked" ? ["favorites", "history"] : ["history"];
  }
  if (primary === "want") return ["watchlist"];
  if (isNotInterested(rec)) return ["notInterested"];
  return [];
}

function ListsPage() {
  const { user, loading } = useAuth();
  const { statuses, ready } = useUserStatus();
  const [authOpen, setAuthOpen] = useState(false);
  const [tab, setTab] = useState<Bucket>("watchlist");
  // Show skeletons until auth has resolved AND the status load has settled, so the
  // buckets don't flash "nothing here yet" before the user's saved data arrives.
  const showSkeleton = loading || !ready;

  const grouped = useMemo(() => {
    const out: Record<Bucket, { item: MediaItem; ts: number }[]> = {
      watchlist: [],
      favorites: [],
      history: [],
      notInterested: [],
    };
    for (const [id, rec] of Object.entries(statuses)) {
      const item = snapToItem(id, rec.snapshot ?? {});
      for (const b of bucketsFor(rec)) out[b].push({ item, ts: rec.ts });
    }
    // Most recently touched first — "what did I just save" is the common lookup.
    for (const b of BUCKET_ORDER) out[b].sort((a, z) => z.ts - a.ts);
    return out;
  }, [statuses]);

  const items = grouped[tab].map((e) => e.item);

  return (
    // No min-h-screen here. The root layout already holds the footer at the
    // bottom of a short page; a second full-viewport box inside it made the
    // page exactly one footer taller than the window, so an empty list
    // scrolled 141px into nothing.
    <div className="bg-background text-foreground">
      <main id="main" className="mx-auto max-w-grid px-4 pb-10 pt-6 md:pt-9">
        <h1 className="mb-4 font-display text-4xl font-extrabold leading-[0.95] tracking-tight text-text-bright md:mb-6 md:text-[64px]">
          My lists
        </h1>

        {/* Tabs as pills with live counts, the current one in ink like the
            current section in the header. */}
        <div role="tablist" aria-label="Lists" className="mb-5 flex flex-wrap gap-1 md:gap-1.5">
          {BUCKET_ORDER.map((b) => {
            const selected = tab === b;
            return (
              <button
                key={b}
                role="tab"
                aria-selected={selected}
                type="button"
                onClick={() => setTab(b)}
                className={
                  "flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-2 text-base font-bold leading-none transition-colors md:gap-1.5 md:px-3.5 md:text-lg " +
                  (selected
                    ? "bg-text-bright text-background"
                    : "bg-panel text-text-bright hover:bg-border")
                }
              >
                {BUCKET_LABEL[b]}
                {!showSkeleton && (
                  <span
                    className={`font-mono text-sm tabular-nums ${selected ? "opacity-80" : "text-text-dim"}`}
                  >
                    {grouped[b].length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {!showSkeleton && items.length > 1 && (
          <p className="mb-4 text-base text-text-dim">Newest first.</p>
        )}

        {showSkeleton ? (
          <MediaGridSkeleton count={12} />
        ) : items.length === 0 ? (
          <EmptyState
            line={BUCKET_EMPTY[tab].line}
            hint={BUCKET_EMPTY[tab].hint}
            action={
              <Link to={BUCKET_EMPTY[tab].to} className={EMPTY_ACTION_CLASS}>
                {BUCKET_EMPTY[tab].cta}
              </Link>
            }
          />
        ) : (
          <MediaGrid items={items} />
        )}

        {/* A guest's picks are already here: useUserStatus reads them from this
            browser, and the rate deck sends people here promising they were
            saved. The offer to keep them is real, so it stays, but it waits
            until there is something to lose and sits under the list it is
            about instead of above every tab. */}
        {!loading && !user && !showSkeleton && items.length > 0 && (
          <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <p className="text-base text-text-muted">Saved on this device.</p>
            <button
              type="button"
              onClick={() => setAuthOpen(true)}
              className="cursor-pointer rounded-full bg-text-bright px-3.5 py-1.5 text-base font-bold text-background hover:opacity-90"
            >
              Sign in to keep them
            </button>
            <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
          </div>
        )}
      </main>
    </div>
  );
}
