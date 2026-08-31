import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bookmark, Check, EyeOff, Heart } from "lucide-react";
import { TopBar } from "@/components/balasaur/TopBar";
import { MediaGrid } from "@/components/balasaur/MediaGrid";
import { MediaGridSkeleton } from "@/components/balasaur/MediaCardSkeleton";
import { useUserStatus } from "@/hooks/useUserStatus";
import { useAuth } from "@/hooks/useAuth";
import { AuthDialog } from "@/components/balasaur/AuthDialog";
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

const BUCKET_META: Record<
  Bucket,
  { label: string; hint: string; Icon: typeof Bookmark; iconClass: string }
> = {
  watchlist: {
    label: "Watchlist",
    hint: "Saved to watch later",
    Icon: Bookmark,
    iconClass: "text-[#e8b84b]",
  },
  favorites: {
    label: "Favorites",
    hint: "Watched and liked",
    Icon: Heart,
    iconClass: "text-rating",
  },
  history: {
    label: "History",
    hint: "Everything you've watched",
    Icon: Check,
    iconClass: "text-primary",
  },
  notInterested: {
    label: "Never",
    hint: "Hidden from the deck for good",
    Icon: EyeOff,
    iconClass: "text-[#c75d6e]",
  },
};

// Empty states that point somewhere: the grid for saving, the deck for rating.
// `to` is a literal union of real route paths so a dead target fails typecheck
// instead of falling through to the /$handle catch-all at runtime.
const BUCKET_EMPTY: Record<Bucket, { text: string; cta: string; to: "/" | "/watched" }> = {
  watchlist: {
    text: "Nothing saved yet. Hover a poster in the grid and hit Save, or swipe left in the deck.",
    cta: "Browse the grid",
    to: "/",
  },
  favorites: {
    text: "No favorites yet. Mark something Watched and tap “Liked it”, or swipe up in the deck.",
    cta: "Rate titles",
    to: "/watched",
  },
  history: {
    text: "Nothing watched yet. The fastest way to build your history is a quick deck session.",
    cta: "Rate titles",
    to: "/watched",
  },
  notInterested: {
    text: "Nothing hidden. Press X in the deck (or “Never show this” on a title page) to keep the junk out of your recommendations.",
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

  const active = BUCKET_META[tab];
  const items = grouped[tab].map((e) => e.item);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <main id="main" className="mx-auto max-w-[1600px] px-4 py-6">
        <h1 className="mb-4 font-mono text-[14px] uppercase tracking-[0.12em] text-text-bright">
          My lists
        </h1>

        {/* A guest's picks are already here: useUserStatus reads them from this
            browser. Hiding the whole page behind a sign-in wall threw away the
            one moment an anonymous visitor has invested something, and the rate
            deck sends them here promising their picks were saved. So the lists
            always render and this offers to make them permanent. */}
        {!loading && !user && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[5px] border border-border bg-panel px-4 py-3">
            <p className="font-mono text-[11px] text-text-muted">
              These are saved on this device. An account keeps them when you switch browsers.
            </p>
            <button
              type="button"
              onClick={() => setAuthOpen(true)}
              className="shrink-0 cursor-pointer rounded-[5px] bg-primary px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-primary-foreground hover:bg-primary/90"
            >
              Keep them
            </button>
            <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
          </div>
        )}

        <>
          {/* Tab bar with live counts */}
          <div
            role="tablist"
            aria-label="Lists"
            className="mb-5 flex flex-wrap gap-1 border-b border-border"
          >
            {BUCKET_ORDER.map((b) => {
              const meta = BUCKET_META[b];
              const selected = tab === b;
              return (
                <button
                  key={b}
                  role="tab"
                  aria-selected={selected}
                  type="button"
                  onClick={() => setTab(b)}
                  className={
                    "flex cursor-pointer items-center gap-1.5 border-b-2 px-3 py-2 font-mono text-[11px] uppercase tracking-wider transition-colors " +
                    (selected
                      ? "border-primary text-text-bright"
                      : "border-transparent text-text-muted hover:text-text-bright")
                  }
                >
                  <meta.Icon className={`h-3.5 w-3.5 ${selected ? meta.iconClass : ""}`} />
                  {meta.label}
                  <span className="font-mono text-[12px] text-text-dim">
                    {showSkeleton ? "" : grouped[b].length}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="mb-4 font-mono text-[11px] uppercase tracking-wider text-text-dim">
            {active.hint} · newest first · open a title to change its status
          </p>

          {showSkeleton ? (
            <MediaGridSkeleton count={12} />
          ) : items.length === 0 ? (
            <div className="rounded-[5px] border border-border bg-panel p-8 text-center">
              <p className="mx-auto max-w-md font-mono text-[11px] leading-relaxed text-text-muted">
                {BUCKET_EMPTY[tab].text}
              </p>
              <Link
                to={BUCKET_EMPTY[tab].to}
                className="mt-4 inline-block rounded-[5px] bg-primary px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-primary-foreground hover:bg-primary/90"
              >
                {BUCKET_EMPTY[tab].cta}
              </Link>
            </div>
          ) : (
            <MediaGrid items={items} />
          )}
        </>
      </main>
    </div>
  );
}
