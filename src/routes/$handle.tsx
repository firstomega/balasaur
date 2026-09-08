import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Check } from "lucide-react";
import {
  getPublicProfile,
  type PublicArcadeBest,
  type PublicMediaItem,
} from "@/lib/profile.functions";
import { TopBar } from "@/components/balasaur/TopBar";
import { Avatar } from "@/components/balasaur/Avatar";
import { EmptyState, EMPTY_ACTION_CLASS } from "@/components/balasaur/EmptyState";
import { CometMark } from "@/components/arcade/CometChip";
import { GAMES, HUB_ORDER } from "@/lib/arcade/games";
import type { GameSlug } from "@/lib/arcade/types";
import { useMyProfile } from "@/hooks/useMyProfile";
import { useUserStatus } from "@/hooks/useUserStatus";
import { SITE_ORIGIN, buildMeta, canonicalLink, clampDescription } from "@/lib/seo";
import { mediaSlug } from "@/lib/slug";
import { tmdbImage, tmdbSrcSet } from "@/lib/tmdbImage";

// Public profile page at /@username. Because TanStack's runtime matcher doesn't
// support a literal prefix glued to a param (and typed params would percent-encode
// the "@"), this is a root catch-all: the whole segment ("@baladan") is the param,
// and we strip the leading "@" ourselves. Single-segment paths that aren't a real
// static route land here too, so non-"@" handles render a friendly not-found.
export const Route = createFileRoute("/$handle")({
  loader: async ({ params }) => {
    const handle = params.handle;
    // Any single-segment path that is not a real route lands here, and this used
    // to answer HTTP 200 with a "Profile not found" page. Google calls that a
    // soft 404: it crawls the page, finds nothing, and the fetch is charged
    // against a crawl budget this site cannot spare. It also meant /ads.txt
    // returned an HTML page, which would break the AdSense crawler once that
    // file matters. A path with no profile behind it is a 404.
    if (!handle.startsWith("@")) throw notFound();
    const username = handle.slice(1);
    const data = await getPublicProfile({ data: { username } });
    if (!data?.found) throw notFound();
    return { kind: "profile" as const, username, data };
  },
  notFoundComponent: HandleNotFound,
  head: ({ loaderData }) => {
    const noindex = { name: "robots", content: "noindex,nofollow" };
    if (!loaderData) {
      return { meta: [{ title: "Profile not found · Balasaur" }, noindex] };
    }
    const p = loaderData.data.profile!;
    const url = `${SITE_ORIGIN}/@${p.username}`;
    const name = p.displayName || `@${p.username}`;
    const title = `${name} (@${p.username}) · Balasaur`;
    const description = clampDescription(p.bio || `${name}'s movies & TV on Balasaur.`);
    return {
      meta: loaderData.data.isPrivate
        ? [{ title }, noindex]
        : buildMeta({ title, description, url, type: "profile" }),
      links: [canonicalLink(url)],
    };
  },
  component: ProfilePage,
});

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <main id="main" className="mx-auto max-w-[1100px] px-5 py-8">
        {children}
      </main>
    </div>
  );
}

function Centered({ title, sub }: { title: string; sub?: string }) {
  return (
    <Shell>
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-[24px] font-black tracking-[-0.02em] text-text-bright">{title}</h1>
        {sub && <p className="mt-2 text-[14px] leading-relaxed text-text-muted">{sub}</p>}
        <Link
          to="/"
          className="mt-5 inline-block rounded-[5px] border border-border px-3 py-1.5 text-[13px] font-bold tracking-[-0.01em] text-text-bright hover:border-border-strong"
        >
          Back to Balasaur
        </Link>
      </div>
    </Shell>
  );
}

function PosterTile({ item, mine }: { item: PublicMediaItem; mine?: boolean }) {
  const seg = item.mediaType === "tv" ? "tv" : item.mediaType === "movie" ? "movie" : null;
  const rawId = item.mediaId.replace(/^(movie|tv)-/, "");
  const slug = mediaSlug(rawId, item.title);
  const inner = (
    <>
      <div
        className={`relative aspect-[2/3] overflow-hidden rounded-[5px] border bg-panel ${
          mine ? "border-rating/60" : "border-border"
        }`}
      >
        {mine && (
          <span className="absolute left-1.5 top-1.5 z-10 inline-flex items-center gap-1 rounded-[5px] border border-rating/60 bg-rating/25 px-1.5 py-0.5 text-[11px] font-bold tracking-[-0.01em] text-rating">
            <Check className="h-3 w-3" aria-hidden="true" />
            You too
          </span>
        )}
        {item.posterUrl ? (
          <img
            src={tmdbImage(item.posterUrl, "w342")}
            srcSet={tmdbSrcSet(item.posterUrl, [
              { w: 185, size: "w185" },
              { w: 342, size: "w342" },
            ])}
            sizes="(max-width: 640px) 33vw, 180px"
            alt={item.title}
            width={342}
            height={513}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center p-2 text-center text-[12px] font-semibold text-text-dim">
            {item.title}
          </div>
        )}
      </div>
      <p className="mt-1.5 line-clamp-1 text-[12px] font-semibold text-text-bright">{item.title}</p>
      {item.year && <p className="font-mono text-[12px] tabular-nums text-text-dim">{item.year}</p>}
    </>
  );
  if (seg === "movie")
    return (
      <Link to="/movie/$id" params={{ id: slug }} className="group block">
        {inner}
      </Link>
    );
  if (seg === "tv")
    return (
      <Link to="/tv/$id" params={{ id: slug }} className="group block">
        {inner}
      </Link>
    );
  return <div>{inner}</div>;
}

function PosterGrid({
  items,
  empty,
  mineIds,
}: {
  items: PublicMediaItem[];
  empty: ReactNode;
  mineIds: Set<string>;
}) {
  if (items.length === 0) {
    return <>{empty}</>;
  }
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
      {items.map((it) => (
        <PosterTile key={it.mediaId} item={it} mine={mineIds.has(it.mediaId)} />
      ))}
    </div>
  );
}

/**
 * The overlap between this profile and the visitor's own list, and the way to
 * their own card. Client-only: the shared count comes from the visitor's
 * status store, which is empty on the server and during hydration, so the
 * cached HTML stays identical for everyone and this appears after mount.
 *
 * The count is checkable rather than asserted: every title it counts carries a
 * "You too" mark in the grid below it.
 */
function CompareLine({ shared, tab }: { shared: number; tab: "watched" | "liked" }) {
  if (shared === 0) return null;
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-[5px] border border-border bg-panel/40 px-3.5 py-2.5">
      <p className="text-[14px] font-semibold text-text-bright">
        {tab === "liked"
          ? `You Loved ${shared} of these too.`
          : `You have watched ${shared} of these too.`}
      </p>
      <Link
        to="/taste"
        className="text-[13px] font-bold tracking-[-0.01em] text-primary hover:underline"
      >
        Your Taste Card
      </Link>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="text-center">
      <div className="text-[24px] font-black tabular-nums leading-none tracking-[-0.02em] text-text-bright">
        {n}
      </div>
      <div className="mt-1 font-mono text-[11px] uppercase tracking-wider text-text-dim">
        {label}
      </div>
    </div>
  );
}

/** The arcade record: comet total plus per-game bests. Renders nothing at
 *  zero comets; a profile that never played shows no arcade furniture. */
function ArcadeSection({ comets, bests }: { comets: number; bests: PublicArcadeBest[] }) {
  if (comets <= 0) return null;
  const ordered = HUB_ORDER.map((slug) =>
    bests.find((b) => b.game === slug && b.bestScore > 0),
  ).filter((b): b is PublicArcadeBest => !!b);
  return (
    <section className="mt-6 rounded-[6px] border border-border bg-panel/40 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-black tracking-[-0.02em] text-text-bright">Arcade</h2>
        <span className="inline-flex items-center gap-1.5 font-mono text-[13px] tabular-nums text-text-bright">
          <CometMark className="h-4 w-4 text-primary" />
          <span className="tabular-nums">{comets}</span> comets
        </span>
      </div>
      {ordered.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {ordered.map((b) => (
            <span
              key={b.game}
              className="rounded-[5px] border border-border bg-panel px-2.5 py-1 text-[12px] text-text-muted"
            >
              {GAMES[b.game as GameSlug]?.name ?? b.game}{" "}
              <span className="font-mono tabular-nums text-text-bright">best {b.bestScore}</span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function HandleNotFound() {
  return (
    <Centered
      title="Profile not found"
      sub="This handle doesn't exist (yet). Check the spelling?"
    />
  );
}

function ProfilePage() {
  const loaderData = Route.useLoaderData();
  const { data: me } = useMyProfile();
  const { statuses } = useUserStatus();
  const [tab, setTab] = useState<"watched" | "liked">("watched");

  const { data } = loaderData;
  const p = data.profile!;
  const isOwner = !!me && me.username.toLowerCase() === p.username.toLowerCase();

  const items = useMemo(
    () => (tab === "watched" ? (data.watched ?? []) : (data.liked ?? [])),
    [tab, data.watched, data.liked],
  );
  // Which of these the visitor has filed too. Every id in here gets a mark on
  // its tile, so the count above the grid can be checked rather than believed.
  const mineIds = useMemo(() => {
    const out = new Set<string>();
    for (const it of items) {
      const rec = statuses[it.mediaId];
      if (!rec || rec.status !== "seen") continue;
      if (tab === "liked" && rec.sentiment !== "liked") continue;
      out.add(it.mediaId);
    }
    return out;
  }, [items, statuses, tab]);

  if (data.isPrivate) {
    return (
      <Centered
        title={`@${p.username} is private`}
        sub="This profile isn't public. Only the owner can see what's inside."
      />
    );
  }

  const joined = new Date(p.createdAt).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  return (
    <Shell>
      {/* Header */}
      <header className="flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-start">
        <Avatar
          username={p.username}
          displayName={p.displayName}
          preset={p.avatarPreset}
          size={88}
          className="text-[34px]"
        />
        <div className="min-w-0 flex-1">
          <h1 className="text-[28px] font-black leading-[1.05] tracking-[-0.02em] text-text-bright">
            {p.displayName || `@${p.username}`}
          </h1>
          <p className="mt-0.5 font-mono text-[13px] text-primary">@{p.username}</p>
          {p.bio && (
            <p className="mt-3 max-w-prose whitespace-pre-line font-sans text-[14px] leading-relaxed text-text-muted">
              {p.bio}
            </p>
          )}
          {p.favoriteGenres.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {p.favoriteGenres.map((g: string) => (
                <span
                  key={g}
                  className="rounded-full border border-border bg-panel px-2 py-0.5 text-[12px] font-semibold text-text-muted"
                >
                  {g}
                </span>
              ))}
            </div>
          )}
          <p className="mt-3 font-mono text-[12px] tabular-nums text-text-dim">Joined {joined}</p>
        </div>
        <div className="flex items-center gap-5 sm:flex-col sm:items-end sm:gap-3">
          <div className="flex gap-5">
            <Stat n={data.stats?.watched ?? 0} label="Watched" />
            <Stat n={data.stats?.liked ?? 0} label="Liked" />
            <Stat n={data.stats?.want ?? 0} label="Watchlist" />
          </div>
          {isOwner && (
            <Link
              to="/profile"
              className="rounded-[5px] border border-border bg-panel px-3 py-1.5 text-[13px] font-bold tracking-[-0.01em] text-text-bright hover:border-primary hover:text-primary"
            >
              Edit profile
            </Link>
          )}
        </div>
      </header>

      <ArcadeSection comets={data.comets ?? 0} bests={data.bests ?? []} />

      {/* Tabs */}
      <nav className="mt-6 flex gap-1 border-b border-border">
        {(["watched", "liked"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-[14px] font-bold tracking-[-0.01em] ${
              tab === t
                ? "border-primary text-text-bright"
                : "border-transparent text-text-dim hover:text-text-muted"
            }`}
          >
            {t === "watched" ? "Watched" : "Liked"}
          </button>
        ))}
      </nav>

      <CompareLine shared={mineIds.size} tab={tab} />

      <div className="mt-5">
        <PosterGrid
          mineIds={mineIds}
          items={items}
          empty={
            isOwner ? (
              <EmptyState
                variant="inline"
                line={
                  tab === "watched"
                    ? "You have not marked anything watched."
                    : "You have not marked anything Loved."
                }
                hint={
                  tab === "watched"
                    ? "Swipe right in the deck on what you have seen. It shows up here."
                    : "Swipe up in the deck on the ones you loved. They show up here."
                }
                action={
                  <Link to="/watched" className={EMPTY_ACTION_CLASS}>
                    Rate titles
                  </Link>
                }
              />
            ) : (
              <EmptyState
                variant="inline"
                line={
                  tab === "watched"
                    ? "This profile has nothing marked watched."
                    : "This profile has nothing marked Loved."
                }
                hint="Rate a few titles and yours fills in."
                action={
                  <Link to="/watched" className={EMPTY_ACTION_CLASS}>
                    Build your own
                  </Link>
                }
              />
            )
          }
        />
      </div>
    </Shell>
  );
}
