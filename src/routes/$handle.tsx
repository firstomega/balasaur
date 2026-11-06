import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link, notFound, useParams } from "@tanstack/react-router";
import { Check } from "lucide-react";
import {
  getPublicProfile,
  type PublicArcadeBest,
  type PublicMediaItem,
} from "@/lib/profile.functions";
import { Avatar } from "@/components/balasaur/Avatar";
import { EmptyState, EMPTY_ACTION_CLASS } from "@/components/balasaur/EmptyState";
import { MediaCard } from "@/components/balasaur/MediaCard";
import { NotFoundPage } from "@/components/balasaur/NotFoundPage";
import { CometMark } from "@/components/arcade/CometChip";
import { GAMES, HUB_ORDER } from "@/lib/arcade/games";
import type { GameSlug } from "@/lib/arcade/types";
import { useMyProfile } from "@/hooks/useMyProfile";
import { useUserStatus } from "@/hooks/useUserStatus";
import { SITE_ORIGIN, buildMeta, canonicalLink, clampDescription } from "@/lib/seo";
import type { MediaItem, MediaType } from "@/types/media";

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

/** The display heading, the same cut and size as the other personal pages. */
const H1 =
  "font-display text-4xl font-extrabold leading-[0.95] tracking-tight text-text-bright md:text-[56px]";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background text-foreground">
      <main id="main" className="mx-auto max-w-content px-4 pb-12 pt-6 md:pt-9">
        {children}
      </main>
    </div>
  );
}

/** A status row as the card expects it. The card links by id and title, the
 *  same /movie or /tv address the old poster tile built. */
function toMediaItem(it: PublicMediaItem): MediaItem {
  return {
    id: it.mediaId,
    mediaType: (it.mediaType as MediaType) ?? "movie",
    title: it.title,
    year: it.year ?? "",
    overview: "",
    posterUrl: it.posterUrl ?? "",
    ratings: {},
    genres: [],
    streaming: [],
    lengthLabel: "",
    people: [],
    swatch: it.swatch ?? null,
  };
}

/** Marks a title the visitor has filed too, in the place the card's own
 *  Seen tag sits, so the count above the grid can be checked card by card. */
function YouToo() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-text-bright py-0.5 pl-1 pr-2 text-xs font-bold text-background">
      <Check className="h-3 w-3" aria-hidden="true" />
      You too
    </span>
  );
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
    <div className="grid grid-cols-2 gap-x-3.5 gap-y-6 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {items.map((it) => (
        <MediaCard
          key={it.mediaId}
          item={toMediaItem(it)}
          posterOverlay={mineIds.has(it.mediaId) ? <YouToo /> : undefined}
        />
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
    <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-panel px-4 py-3">
      <p className="text-lg font-bold text-text-bright">
        {tab === "liked"
          ? `You Loved ${shared} of these too.`
          : `You have seen ${shared} of these too.`}
      </p>
      <Link
        to="/taste"
        className="rounded-full bg-text-bright px-3.5 py-1.5 text-base font-bold text-background hover:opacity-90"
      >
        Your Taste Card
      </Link>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <div className="font-display text-3xl font-extrabold tabular-nums leading-none text-text-bright">
        {n}
      </div>
      <div className="mt-1 text-sm font-bold text-text-muted">{label}</div>
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
    <section className="mt-6 rounded-2xl bg-panel p-4 md:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl font-extrabold leading-none tracking-tight text-text-bright">
          Arcade
        </h2>
        <span className="inline-flex items-center gap-1.5 text-base font-bold text-text-bright">
          <CometMark className="h-4 w-4" />
          <span className="font-mono tabular-nums">{comets}</span> comets
        </span>
      </div>
      {ordered.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {ordered.map((b) => (
            <span
              key={b.game}
              className="rounded-full bg-background px-3 py-1 text-sm font-bold text-text-muted"
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

/**
 * Every unknown one-segment address lands here, not only mistyped handles, so
 * only an "@" address is called a profile.
 */
function HandleNotFound() {
  const { handle } = useParams({ strict: false }) as { handle?: string };
  if (handle?.startsWith("@") && handle.length > 1) {
    return <NotFoundPage title="Profile not found" line={`No profile has the handle ${handle}.`} />;
  }
  return <NotFoundPage title="Page not found" />;
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
    return <NotFoundPage title={`@${p.username} is private`} />;
  }

  const joined = new Date(p.createdAt).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  return (
    <Shell>
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <Avatar
          username={p.username}
          displayName={p.displayName}
          preset={p.avatarPreset}
          size={88}
          className="text-3xl"
        />
        <div className="min-w-0 flex-1">
          <h1 className={H1}>{p.displayName || `@${p.username}`}</h1>
          <p className="mt-1.5 font-mono text-base text-text-muted">@{p.username}</p>
          {p.bio && (
            <p className="mt-3 max-w-prose whitespace-pre-line text-lg leading-relaxed text-foreground">
              {p.bio}
            </p>
          )}
          {p.favoriteGenres.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {p.favoriteGenres.map((g: string) => (
                <span
                  key={g}
                  className="rounded-full border border-border-strong px-2.5 py-0.5 text-sm font-bold text-text-bright"
                >
                  {g}
                </span>
              ))}
            </div>
          )}
          <p className="mt-3 text-sm text-text-dim">Joined {joined}</p>
        </div>
        <div className="flex flex-wrap items-center gap-6 sm:flex-col sm:items-end sm:gap-4">
          <div className="flex gap-6">
            <Stat n={data.stats?.watched ?? 0} label="Seen" />
            <Stat n={data.stats?.liked ?? 0} label="Loved" />
            <Stat n={data.stats?.want ?? 0} label="Watchlist" />
          </div>
          {isOwner && (
            <Link
              to="/profile"
              className="rounded-full border border-border-strong px-3.5 py-1.5 text-base font-bold text-text-bright hover:border-text-bright"
            >
              Edit profile
            </Link>
          )}
        </div>
      </header>

      <ArcadeSection comets={data.comets ?? 0} bests={data.bests ?? []} />

      {/* Tabs as pills, the current one in ink like the current section in
          the header. */}
      <nav aria-label="Lists" className="mb-5 mt-8 flex gap-1.5">
        {(["watched", "liked"] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            className={
              "cursor-pointer rounded-full px-3.5 py-2 text-lg font-bold leading-none transition-colors " +
              (tab === t
                ? "bg-text-bright text-background"
                : "bg-panel text-text-bright hover:bg-border")
            }
          >
            {t === "watched" ? "Seen" : "Loved"}
          </button>
        ))}
      </nav>

      <CompareLine shared={mineIds.size} tab={tab} />

      <PosterGrid
        mineIds={mineIds}
        items={items}
        empty={
          isOwner ? (
            <EmptyState
              variant="inline"
              line={tab === "watched" ? "No Seen titles." : "No Loved titles."}
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
                  ? "This profile has no Seen titles."
                  : "This profile has no Loved titles."
              }
              action={
                <Link to="/watched" className={EMPTY_ACTION_CLASS}>
                  Rate titles
                </Link>
              }
            />
          )
        }
      />
    </Shell>
  );
}
