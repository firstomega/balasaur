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

type Bucket = "want" | "loved" | "notLoved" | "notForMe";

const BUCKET_LABEL: Record<Bucket, string> = {
  want: "Want it",
  loved: "Seen & loved",
  notLoved: "Seen, didn't love",
  notForMe: "Not for me",
};

function statusToItem(id: string, snap: NonNullable<ReturnType<typeof bucketize>>["snap"]): MediaItem {
  return {
    id,
    mediaType: (snap.mediaType as MediaType) ?? "movie",
    title: snap.title,
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

function bucketize(
  rec: { status: string; sentiment?: string; intent?: string },
  snap: { mediaType?: string; title?: string; posterUrl?: string; year?: string },
): { bucket: Bucket; snap: { mediaType?: string; title: string; posterUrl?: string; year?: string } } | null {
  let bucket: Bucket | null = null;
  if (rec.status === "seen" && rec.sentiment === "liked") bucket = "loved";
  else if (rec.status === "seen" && rec.sentiment === "disliked") bucket = "notLoved";
  else if (rec.status === "unseen" && rec.intent === "want") bucket = "want";
  else if (rec.status === "unseen" && rec.intent === "not_interested") bucket = "notForMe";
  if (!bucket) return null;
  return { bucket, snap: { ...snap, title: snap.title ?? "(untitled)" } };
}

function ListsPage() {
  const { user, loading } = useAuth();
  const { statuses } = useUserStatus();
  const [authOpen, setAuthOpen] = useState(false);

  const grouped = useMemo(() => {
    const out: Record<Bucket, MediaItem[]> = {
      want: [],
      loved: [],
      notLoved: [],
      notForMe: [],
    };
    for (const [id, rec] of Object.entries(statuses)) {
      const b = bucketize(rec, rec.snapshot ?? {});
      if (!b) continue;
      out[b.bucket].push(statusToItem(id, b.snap));
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
              Your triage history travels with your account.
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
            {(Object.keys(grouped) as Bucket[]).map((b) => (
              <section key={b}>
                <div className="mb-3 flex items-baseline justify-between border-b border-border pb-1">
                  <h2 className="font-mono text-[12px] uppercase tracking-wider text-text-bright">
                    {BUCKET_LABEL[b]}
                  </h2>
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