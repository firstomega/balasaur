import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { getPublicProfile, type PublicMediaItem } from "@/lib/profile.functions";
import { TopBar } from "@/components/balasaur/TopBar";
import { Avatar } from "@/components/balasaur/Avatar";
import { useMyProfile } from "@/hooks/useMyProfile";
import { SITE_ORIGIN, buildMeta, canonicalLink, clampDescription } from "@/lib/seo";

// Public profile page at /@username. Because TanStack's runtime matcher doesn't
// support a literal prefix glued to a param (and typed params would percent-encode
// the "@"), this is a root catch-all: the whole segment ("@baladan") is the param,
// and we strip the leading "@" ourselves. Single-segment paths that aren't a real
// static route land here too, so non-"@" handles render a friendly not-found.
export const Route = createFileRoute("/$handle")({
  loader: async ({ params }) => {
    const handle = params.handle;
    if (!handle.startsWith("@")) {
      return { kind: "not-handle" as const, username: "" };
    }
    const username = handle.slice(1);
    const data = await getPublicProfile({ data: { username } });
    return { kind: "profile" as const, username, data };
  },
  head: ({ loaderData }) => {
    const noindex = { name: "robots", content: "noindex,nofollow" };
    if (!loaderData || loaderData.kind !== "profile" || !loaderData.data.found) {
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
      <main className="mx-auto max-w-[1100px] px-5 py-8">{children}</main>
    </div>
  );
}

function Centered({ title, sub }: { title: string; sub?: string }) {
  return (
    <Shell>
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="font-sans text-xl font-semibold text-text-bright">{title}</h1>
        {sub && <p className="mt-2 font-mono text-[12px] text-text-muted">{sub}</p>}
        <Link
          to="/"
          className="mt-5 inline-block rounded-[5px] border border-border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-text-bright hover:border-border-strong"
        >
          Back to Balasaur
        </Link>
      </div>
    </Shell>
  );
}

function PosterTile({ item }: { item: PublicMediaItem }) {
  const seg = item.mediaType === "tv" ? "tv" : item.mediaType === "movie" ? "movie" : null;
  const rawId = item.mediaId.replace(/^(movie|tv)-/, "");
  const inner = (
    <>
      <div className="aspect-[2/3] overflow-hidden rounded-[5px] border border-border bg-panel">
        {item.posterUrl ? (
          <img
            src={item.posterUrl}
            alt={item.title}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center p-2 text-center font-mono text-[10px] text-text-dim">
            {item.title}
          </div>
        )}
      </div>
      <p className="mt-1.5 line-clamp-1 font-mono text-[11px] text-text-bright">{item.title}</p>
      {item.year && <p className="font-mono text-[10px] text-text-dim">{item.year}</p>}
    </>
  );
  if (seg === "movie")
    return (
      <Link to="/movie/$id" params={{ id: rawId }} className="group block">
        {inner}
      </Link>
    );
  if (seg === "tv")
    return (
      <Link to="/tv/$id" params={{ id: rawId }} className="group block">
        {inner}
      </Link>
    );
  return <div>{inner}</div>;
}

function PosterGrid({ items, empty }: { items: PublicMediaItem[]; empty: string }) {
  if (items.length === 0) {
    return <p className="px-1 py-10 text-center font-mono text-[12px] text-text-dim">{empty}</p>;
  }
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
      {items.map((it) => (
        <PosterTile key={it.mediaId} item={it} />
      ))}
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="text-center">
      <div className="font-sans text-xl font-semibold text-text-bright">{n}</div>
      <div className="font-mono text-[10px] uppercase tracking-wider text-text-dim">{label}</div>
    </div>
  );
}

function ProfilePage() {
  const loaderData = Route.useLoaderData();
  const { data: me } = useMyProfile();
  const [tab, setTab] = useState<"watched" | "liked">("watched");

  if (loaderData.kind !== "profile" || !loaderData.data.found) {
    return (
      <Centered
        title="Profile not found"
        sub="This handle doesn't exist (yet). Check the spelling?"
      />
    );
  }

  const { data } = loaderData;
  const p = data.profile!;
  const isOwner = !!me && me.username.toLowerCase() === p.username.toLowerCase();

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
  const items = tab === "watched" ? (data.watched ?? []) : (data.liked ?? []);

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
          <h1 className="font-sans text-2xl font-semibold tracking-tight text-text-bright">
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
                  className="rounded-full border border-border bg-panel px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-text-muted"
                >
                  {g}
                </span>
              ))}
            </div>
          )}
          <p className="mt-3 font-mono text-[10.5px] uppercase tracking-wider text-text-dim">
            Joined {joined}
          </p>
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
              className="rounded-[5px] border border-border bg-panel px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-text-bright hover:border-primary hover:text-primary"
            >
              Edit profile
            </Link>
          )}
        </div>
      </header>

      {/* Tabs */}
      <nav className="mt-6 flex gap-1 border-b border-border">
        {(["watched", "liked"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 font-mono text-[12px] uppercase tracking-wider ${
              tab === t
                ? "border-primary text-text-bright"
                : "border-transparent text-text-dim hover:text-text-muted"
            }`}
          >
            {t === "watched" ? "Watched" : "Liked"}
          </button>
        ))}
      </nav>

      <div className="mt-5">
        <PosterGrid
          items={items}
          empty={
            tab === "watched"
              ? isOwner
                ? "You haven't marked anything watched yet."
                : "Nothing watched yet."
              : isOwner
                ? "You haven't liked anything yet."
                : "Nothing liked yet."
          }
        />
      </div>
    </Shell>
  );
}
